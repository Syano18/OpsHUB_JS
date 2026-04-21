import os
import sys
import time
import certifi
import socket
import json
import logging
from datetime import date, datetime
from dotenv import load_dotenv
import libsql_client
from winotify import Notification, audio

# --- SETUP FILES & LOGGING ---
_bd = os.path.join(os.getenv("LOCALAPPDATA", os.path.expanduser("~")), "KalingaOpsHub")
os.makedirs(_bd, exist_ok=True)
WATERMARK_FILE = os.path.join(_bd, "watermark.json")
LOG_FILE = os.path.join(_bd, "notifier_debug.log")

# Clear log file on startup if it was last modified on a previous day
if os.path.exists(LOG_FILE):
    if date.fromtimestamp(os.path.getmtime(LOG_FILE)) < date.today():
        try:
            with open(LOG_FILE, 'w'): pass
        except Exception: pass

logging.basicConfig(filename=LOG_FILE, level=logging.DEBUG, 
                    format='%(asctime)s - %(levelname)s - %(message)s')

# --- PATH SETUP ---
def resource_path(p):
    base = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable)
                   if getattr(sys, 'frozen', False) else os.path.abspath('.'))
    return os.path.join(base, p)

# Fix for SSL: CERTIFICATE_VERIFY_FAILED on Windows when packaged
os.environ['SSL_CERT_FILE'] = certifi.where()
os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

def load_env_configs():
    # Load bundled defaults first, then let runtime files override.
    load_dotenv(resource_path(".env"), override=False)
    load_dotenv(resource_path(".env.local"), override=True)

    runtime_dir = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.abspath('.')
    load_dotenv(os.path.join(runtime_dir, ".env"), override=True)
    load_dotenv(os.path.join(runtime_dir, ".env.local"), override=True)

load_env_configs()

# Support both env names: app uses TURSO_DATABASE_URL, older notifier used TURSO_DB_URL.
TURSO_DB_URL = os.getenv("TURSO_DATABASE_URL") or os.getenv("TURSO_DB_URL")
TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN")

def get_turso_fallback_url(url):
    if url and url.startswith("libsql://"):
        return url.replace("libsql://", "https://", 1)
    return None

def check_internet():
    try:
        socket.create_connection(("8.8.8.8", 53), timeout=3)
        return True
    except OSError:
        return False

def load_watermark():
    default_marks = {"last_update": "2000-01-01 00:00:00", "last_error": "2000-01-01 00:00:00"}
    if os.path.exists(WATERMARK_FILE):
        try:
            with open(WATERMARK_FILE, 'r') as f:
                data = json.load(f)
                return {**default_marks, **data}
        except Exception as e: 
            logging.error(f"Error loading watermark: {e}")
    return default_marks

def save_watermark(last_update, last_error):
    try:
        with open(WATERMARK_FILE, 'w') as f:
            json.dump({'last_update': str(last_update), 'last_error': str(last_error)}, f)
    except Exception as e: 
        logging.error(f"Error saving watermark: {e}")

def fetch_all_updates(client, last_update_ts, last_error_ts):
    """Fetches both attendance and errors in a single connection to improve speed."""
    today_str = date.today().isoformat()

    # Fetch Attendance
    sql_att = """
        SELECT full_name, updated_at, time_in_am, time_out_am, time_in_pm, time_out_pm
        FROM attendance
        WHERE date = ?
        AND updated_at > ?
        ORDER BY updated_at ASC
    """
    rs_att = client.execute(sql_att, [today_str, last_update_ts])
    records = [tuple(r) for r in rs_att.rows]

    # Fetch Errors
    sql_err = """
        SELECT error_message, created_at
        FROM punch_errors
        WHERE date(created_at) = ?
        AND created_at > ?
        ORDER BY created_at ASC
    """
    rs_err = client.execute(sql_err, [today_str, last_error_ts])
    errors = [tuple(r) for r in rs_err.rows]

    return records, errors

def send_toast(title, message, is_error=False):
    try:
        toast = Notification(
            app_id="Kalinga OpsHUB",
            title=title,
            msg=message,
            duration="short",
        )
        if is_error:
            toast.set_audio(audio.Reminder, loop=False)
        else:
            toast.set_audio(audio.Default, loop=False)
        toast.show()
        logging.info(f"Notification sent: {title}")
    except Exception as e:
        logging.error(f"Toast Error: {e}")

def main():
    logging.info("Notifier Started (Multi-Table & Batch Mode)!")
    marks = load_watermark()
    last_update_ts = marks['last_update']
    last_error_ts = marks['last_error']
    last_run_day = date.today()
    active_turso_url = TURSO_DB_URL
    
    while True:
        # --- DAILY MAINTENANCE: Clear logs at midnight ---
        current_day = date.today()
        if current_day != last_run_day:
            try:
                # Close handlers to release file lock, clear file, then restart logging
                for handler in logging.root.handlers[:]:
                    handler.close()
                    logging.root.removeHandler(handler)
                with open(LOG_FILE, 'w'): pass
                logging.basicConfig(filename=LOG_FILE, level=logging.DEBUG, 
                                    format='%(asctime)s - %(levelname)s - %(message)s')
                logging.info(f"Log cleared for new day: {current_day}")
            except Exception as e:
                print(f"Failed to clear daily log: {e}")
            last_run_day = current_day

        if not TURSO_DB_URL or not TURSO_AUTH_TOKEN:
            logging.error("Missing Turso credentials: expected TURSO_DATABASE_URL and TURSO_AUTH_TOKEN")
            time.sleep(10)
            continue
            
        if not check_internet():
            time.sleep(10)
            continue
            
        try:
            client = libsql_client.create_client_sync(active_turso_url, auth_token=TURSO_AUTH_TOKEN)
            try:
                records, errors = fetch_all_updates(client, last_update_ts, last_error_ts)
            finally:
                client.close()
        except Exception as e:
            err_msg = str(e)

            # Some packaged environments/proxies reject Turso websocket handshakes.
            # Retry using HTTPS transport if libsql:// fails with websocket status errors.
            fallback_url = get_turso_fallback_url(active_turso_url)
            should_try_fallback = (
                fallback_url
                and fallback_url != active_turso_url
                and (
                    "Invalid response status" in err_msg
                    or "wss://" in err_msg
                    or " 505" in err_msg
                )
            )

            if should_try_fallback:
                logging.warning(
                    "Turso websocket connection failed. Retrying notifier with HTTPS transport."
                )
                active_turso_url = fallback_url
                time.sleep(1)
                continue

            logging.error(f"Connection error: {e}")
            time.sleep(5)
            continue

        if records:
            count = len(records)
            
            if count > 3:
                # BATCH NOTIFICATION
                send_toast(
                    "Batch Attendance Update", 
                    f"{count} new attendance records synced today."
                )
                # Skip to the timestamp of the very last record in the batch
                last_update_ts = records[-1][1]
            else:
                # INDIVIDUAL NOTIFICATIONS
                for rec in records:
                    full_name, updated_at, t_in_am, t_out_am, t_in_pm, t_out_pm = rec
                    
                    if t_out_pm: label, p_time = "Time Out (PM)", t_out_pm
                    elif t_in_pm: label, p_time = "Time In (PM)", t_in_pm
                    elif t_out_am: label, p_time = "Time Out (AM)", t_out_am
                    elif t_in_am: label, p_time = "Time In (AM)", t_in_am
                    else: label, p_time = None

                    display_time = "recorded"
                    if p_time:
                        try:
                            # Convert the 'HH:MM:SS' string from Turso into a formatted 'HH:MM AM/PM' string
                            display_time = datetime.strptime(p_time, "%H:%M:%S").strftime('%I:%M %p')
                        except Exception:
                            display_time = str(p_time)

                    send_toast(
                        "❤ Sumakses!",
                        f"Ni {full_name} ket nag {label} iti oras {display_time}."
                    )
                    last_update_ts = updated_at
                    time.sleep(0.5)

        if errors:
            for err in errors:
                error_msg, created_at = err
                send_toast("🚫 Hooppia!", error_msg, is_error=True)
                last_error_ts = created_at
                time.sleep(0.5)

        save_watermark(last_update_ts, last_error_ts)
        time.sleep(2)

if __name__ == "__main__":
    main()