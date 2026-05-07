#define MyAppName "Kalinga OpsHub"
#define MyAppVersion "0.1.4"
#define MyAppPublisher "ISA II"
#define LegacyAppName "Kalinga OpsHUB"

[Setup]
AppId={{F1D6B6F2-7B1B-4A4E-A0D7-3F1D3C4D9F60}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Kalinga OpsHub
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=no
OutputDir=Output
OutputBaseFilename=KalingaOpsHub-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\Kalinga OpsHub.exe

[Tasks]
Name: "desktopicon"; Description: "Create a desktop icon"; GroupDescription: "Additional icons:"; Flags: unchecked

[Files]
Source: "..\dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\dist\Notifier.exe"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
Type: filesandordirs; Name: "{autopf32}\Kalinga OpsHUB"
Type: filesandordirs; Name: "{autopf32}\Kalinga OpsHub"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\Kalinga OpsHub.exe"; WorkingDir: "{app}"
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\Kalinga OpsHub.exe"; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{commonstartup}\Kalinga OpsHub Notifier"; Filename: "{app}\Notifier.exe"; WorkingDir: "{app}"
Name: "{commonstartup}\Kalinga OpsHub Local Server"; Filename: "{app}\Kalinga OpsHub.exe"; Parameters: "--server-only"; WorkingDir: "{app}"

[Run]
Filename: "{app}\Kalinga OpsHub.exe"; Description: "Launch Kalinga OpsHub"; Flags: postinstall nowait skipifsilent
Filename: "{app}\Notifier.exe"; Flags: nowait runhidden
Filename: "{app}\Kalinga OpsHub.exe"; Parameters: "--server-only"; Flags: nowait runhidden

[UninstallRun]
Filename: "{cmd}"; Parameters: "/C taskkill /F /IM Notifier.exe"; Flags: runhidden; RunOnceId: "KillNotifier"
Filename: "{cmd}"; Parameters: "/C powershell -NoProfile -ExecutionPolicy Bypass -Command ""Get-CimInstance Win32_Process | Where-Object {{ $_.Name -eq 'node.exe' -and $_.CommandLine -like '*resources\\.next\\standalone\\server.js*' }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force }}"""; Flags: runhidden; RunOnceId: "KillLocalServer"

[Code]
function IsLegacyDisplayName(const DisplayName: string): Boolean;
begin
  Result :=
    (Pos('Kalinga OpsHub', DisplayName) = 1) or
    (Pos('{#LegacyAppName}', DisplayName) = 1);
end;

procedure TryUninstallEntry(const RootKey: Integer; const BaseKey: string; const CurrentAppId: string);
var
  I: Integer;
  Keys: TArrayOfString;
  EntryKey: string;
  DisplayName: string;
  UninstallString: string;
  ResultCode: Integer;
begin
  if not RegGetSubkeyNames(RootKey, BaseKey, Keys) then
    exit;

  for I := 0 to GetArrayLength(Keys) - 1 do
  begin
    EntryKey := BaseKey + '\\' + Keys[I];
    if not RegQueryStringValue(RootKey, EntryKey, 'DisplayName', DisplayName) then
      continue;

    if not IsLegacyDisplayName(DisplayName) then
      continue;

    // Skip uninstalling the currently running installer's own entry.
    if (Keys[I] = CurrentAppId + '_is1') then
      continue;

    if RegQueryStringValue(RootKey, EntryKey, 'QuietUninstallString', UninstallString) then
    begin
      Exec(ExpandConstant('{cmd}'), '/C "' + UninstallString + '"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      continue;
    end;

    if RegQueryStringValue(RootKey, EntryKey, 'UninstallString', UninstallString) then
      Exec(ExpandConstant('{cmd}'), '/C "' + UninstallString + ' /SILENT"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

procedure RemovePreviousVersions();
var
  CurrentAppId: string;
  ResultCode: Integer;
begin
  CurrentAppId := '{F1D6B6F2-7B1B-4A4E-A0D7-3F1D3C4D9F60}';

  // Attempt to stop the old Python notifier before running old uninstallers.
  Exec(ExpandConstant('{cmd}'), '/C taskkill /F /IM Notifier.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);

  TryUninstallEntry(HKLM64, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', CurrentAppId);
  TryUninstallEntry(HKLM32, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', CurrentAppId);
  TryUninstallEntry(HKCU, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', CurrentAppId);
  TryUninstallEntry(HKLM64, 'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall', CurrentAppId);
  TryUninstallEntry(HKLM32, 'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall', CurrentAppId);
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
    RemovePreviousVersions();
end;
