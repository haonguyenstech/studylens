; Installer hooks (bundle.windows.nsis.installerHooks in tauri.conf.json).

; StudyLens up to 0.2 was an Electron app: electron-builder installed it in its own folder with its
; own uninstall entry and shortcuts. Remove that copy first, quietly, so there is one StudyLens.
; Settings, projects and notebooks are not touched (both versions use %APPDATA%\StudyLens).
!macro NSIS_HOOK_PREINSTALL
  StrCpy $R1 0
  ${Do}
    EnumRegKey $R2 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall" $R1
    ${If} $R2 == ""
      ${Break}
    ${EndIf}
    IntOp $R1 $R1 + 1
    ReadRegStr $R3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R2" "DisplayName"
    ReadRegStr $R4 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R2" "QuietUninstallString"
    ; electron-builder's entry is named "StudyLens 0.2.0" and has a QuietUninstallString; this app's has none
    StrCpy $R6 $R3 9
    ${If} $R6 == "StudyLens"
    ${AndIf} $R4 != ""
      ; its folder: from the icon path ("…\StudyLens.exe,0"), else the default
      ReadRegStr $R5 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R2" "DisplayIcon"
      ${If} $R5 != ""
        StrCpy $R5 $R5 -2
        ${GetParent} $R5 $R5
      ${Else}
        StrCpy $R5 "$LOCALAPPDATA\Programs\StudyLens"
      ${EndIf}
      ${If} ${FileExists} "$R5\Uninstall StudyLens.exe"
        DetailPrint "Removing the previous StudyLens (0.2 or older)"
        ; _?= runs the uninstaller in place, so ExecWait waits until it is done
        ExecWait '"$R5\Uninstall StudyLens.exe" /S /currentuser _?=$R5'
        Sleep 1000   ; the uninstaller has just exited; let Windows release its file
        Delete "$R5\Uninstall StudyLens.exe"
        RMDir "$R5"
      ${EndIf}
      DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\$R2"
      ${Break}
    ${EndIf}
  ${Loop}
!macroend

; The Electron versions' self-update runs this installer with /S --force-run: start the app after.
; (This app's own updater uses /S /R, handled by the installer itself.)
!macro NSIS_HOOK_POSTINSTALL
  ClearErrors
  ${GetOptions} $CMDLINE "--force-run" $R0
  ${IfNot} ${Errors}
    Exec '"$INSTDIR\${MAINBINARYNAME}.exe"'
  ${EndIf}
!macroend
