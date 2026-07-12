// Native fetch

async function testWorkspaceCreate() {
  console.log("Testing workspace creation...");
  try {
    const res = await fetch('http://localhost:3001/api/workspaces', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'test-workspace',
        description: 'Test workspace created by script'
      })
    });
    
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Response: ${text}`);
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

testWorkspaceCreate();
