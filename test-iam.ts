import { config } from 'dotenv';
config();

async function testIamToken() {
  const url = process.env.IBM_ORCHESTRATE_URL || "https://api.us-south.watson-orchestrate.cloud.ibm.com/instances/cb5cfdd8-941b-42c0-b2a6-b4f38a6e55a3/v1/chat";
  const apikey = process.env.IBM_ORCHESTRATE_API_KEY;

  if (!apikey) {
    console.error("API key missing from .env");
    return;
  }

  console.log("Fetching IAM token...");
  const iamRes = await fetch("https://iam.cloud.ibm.com/identity/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${apikey}`
  });

  if (!iamRes.ok) {
    const text = await iamRes.text();
    console.error("Failed to get IAM token:", iamRes.status, text);
    return;
  }

  const iamData = await iamRes.json();
  const token = iamData.access_token;
  console.log("Successfully got IAM token. Calling Orchestrate...");

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ input: 'hey' })
  });
  
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  console.log(`Body: ${text.substring(0, 200)}`);
}

testIamToken();
