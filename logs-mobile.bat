@echo off
echo ===================================================
echo   MeshDrop Mobile - Real-Time Live Log Stream
echo ===================================================
echo Filtering for: ReactNativeJS, bare runtime, engine, and fatal errors...
echo Press Ctrl+C to stop.
echo.

set TARGET_DEV=%1
if "%TARGET_DEV%"=="" (
  for /f "skip=1 tokens=1" %%d in ('adb devices') do (
    if not "%%d"=="" (
      if not "%%d"=="List" (
        set TARGET_DEV=%%d
        goto :found
      )
    )
  )
)

:found
if not "%TARGET_DEV%"=="" (
  echo Streaming logs from device: %TARGET_DEV%
  echo.
  adb -s %TARGET_DEV% logcat -v time -s ReactNativeJS:* bare:* MeshDropEngineAssets:* AndroidRuntime:E
) else (
  adb logcat -v time -s ReactNativeJS:* bare:* MeshDropEngineAssets:* AndroidRuntime:E
)
