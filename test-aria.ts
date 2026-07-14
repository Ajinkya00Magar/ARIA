import { config } from 'dotenv';
config();

async function testAriaChat() {
  const apikey = process.env.IBM_ORCHESTRATE_API_KEY;
  const baseUrl = "https://api.us-south.watson-orchestrate.cloud.ibm.com/instances/cb5cfdd8-941b-42c0-b2a6-b4f38a6e55a3";
  const agentId = "d7591be3-6da3-49b7-aadf-6602c2958bc2";
  
  const iamRes = await fetch("https://iam.cloud.ibm.com/identity/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${apikey}`
  });
  const token = (await iamRes.json()).access_token;

  const url = `${baseUrl}/v1/orchestrate/${agentId}/chat/completions`;
  console.log("Testing full chat URL:", url);
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      input: 'hello',
      messages: [{ role: 'system', content: 'You are Aria' }, { role: 'user', content: 'hello' }],
      context: { workspace_id: '' },
      stream: true
    })
  });
  
  console.log(`Status: ${res.status}`);
  const text = await res.text();
  console.log(`Body: ${text.substring(0, 200)}`);
}

testAriaChat();
