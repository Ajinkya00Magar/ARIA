import fetch from 'node-fetch';

async function testLocalApi() {
  console.log("Testing localhost API...");
  try {
    const res = await fetch('http://localhost:3001/api/agent/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Assuming auth is mocked or we can bypass it? Wait, agentRouter uses authenticate middleware.
        // Let's check if there's a dev token or we can just hit it.
      },
      body: JSON.stringify({
        chatId: 'test1234',
        content: 'hello',
        workspaceId: ''
      })
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Body:", text.substring(0, 500));
  } catch (err) {
    console.error("Error:", err);
  }
}

testLocalApi();
