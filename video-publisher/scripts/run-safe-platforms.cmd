@echo off
node "%~dp0v2\publisher.mjs" %*
exit /b %errorlevel%
