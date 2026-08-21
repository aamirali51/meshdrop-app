!macro customInstall
  DetailPrint "Configuring Windows Defender Firewall for MeshDrop..."
  nsExec::Exec 'netsh advfirewall firewall add rule name="MeshDrop" dir=in action=allow program="$INSTDIR\MeshDrop.exe" enable=yes profile=any'
  nsExec::Exec 'netsh advfirewall firewall add rule name="MeshDrop" dir=out action=allow program="$INSTDIR\MeshDrop.exe" enable=yes profile=any'
!macroend

!macro customUninstall
  DetailPrint "Removing Windows Defender Firewall rules for MeshDrop..."
  nsExec::Exec 'netsh advfirewall firewall delete rule name="MeshDrop"'
!macroend
