@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>&1
if errorlevel 1 (
  echo Python was not found. Install Python and add it to PATH.
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo npm was not found. Install Node.js and add it to PATH.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo JavaScript dependencies are missing.
  echo Run: npm install
  pause
  exit /b 1
)

python -c "import fastapi, reportlab, bertopic, sentence_transformers" >nul 2>&1
if errorlevel 1 (
  echo Python dependencies are missing.
  echo Run: python -m pip install -r backend\requirements.txt
  pause
  exit /b 1
)

python backend\scripts\cache_topic_model.py
if errorlevel 1 (
  echo BERTopic's transformer model could not be prepared.
  echo Check your internet connection and run this launcher again.
  pause
  exit /b 1
)

echo Starting ResearchFlow in two terminal windows...
start "ResearchFlow Backend" cmd /k "cd /d ""%CD%\backend"" && python -m uvicorn app.main:app --reload --port 5000"
start "ResearchFlow Frontend" cmd /k "cd /d ""%CD%"" && npm.cmd run dev -w frontend -- --host 127.0.0.1 --port 5173 --strictPort"

echo.
echo Frontend: http://127.0.0.1:5173
echo API docs: http://127.0.0.1:5000/docs
echo Close both ResearchFlow terminal windows to stop the app.
pause
endlocal
