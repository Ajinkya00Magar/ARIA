const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const execAsync = promisify(exec);

const app = express();
app.use(express.json());

// 1. Run Terminal Command
app.post('/run_command', async (req, res) => {
  const { command, cwd } = req.body;
  console.log(`[EXEC] ${command}`);
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: cwd || process.cwd() });
    res.json({ stdout, stderr });
  } catch (error) {
    res.json({ stdout: error.stdout, stderr: error.stderr || error.message });
  }
});

// 2. Read File
app.post('/read_file', (req, res) => {
  console.log(`[READ] ${req.body.path}`);
  try {
    const content = fs.readFileSync(path.resolve(req.body.path), 'utf-8');
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Write File
app.post('/write_file', (req, res) => {
  console.log(`[WRITE] ${req.body.path}`);
  try {
    fs.mkdirSync(path.dirname(path.resolve(req.body.path)), { recursive: true });
    fs.writeFileSync(path.resolve(req.body.path), req.body.content, 'utf-8');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. List Directory
app.post('/list_dir', (req, res) => {
  console.log(`[LIST DIR] ${req.body.path || process.cwd()}`);
  try {
    const targetPath = path.resolve(req.body.path || process.cwd());
    const items = fs.readdirSync(targetPath, { withFileTypes: true });
    const contents = items.map(item => ({
      name: item.name,
      isDirectory: item.isDirectory(),
      path: path.join(targetPath, item.name)
    }));
    res.json({ contents });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Grep Search (Search inside codebase)
app.post('/grep_search', async (req, res) => {
  const { query, searchPath } = req.body;
  console.log(`[SEARCH] ${query}`);
  try {
    // Uses native Linux grep which works perfectly on IBM Cloud Code Engine
    const cmd = `grep -rn "${query}" ${searchPath || '.'} | head -n 50`;
    const { stdout, stderr } = await execAsync(cmd, { cwd: process.cwd() });
    res.json({ results: stdout, stderr });
  } catch (error) {
    res.json({ results: error.stdout, stderr: error.stderr || error.message });
  }
});

// IBM Cloud Code Engine uses port 8080 by default
const PORT = process.env.PORT || 8080; 
app.listen(PORT, () => {
  console.log(`Super IDE Agent Tools listening on port ${PORT}`);
});
