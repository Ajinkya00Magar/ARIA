import { config } from 'dotenv';
config();

async function testUrls() {
  const apikey = process.env.IBM_ORCHESTRATE_API_KEY;
  const base = "https://api.us-south.watson-orchestrate.cloud.ibm.com/instances/cb5cfdd8-941b-42c0-b2a6-b4f38a6e55a3";
  const paths = [
    "",
    "/v1/chat",
    "/v2/message",
    "/message",
    "/chat"
  ];

  console.log("Fetching IAM token...");
  const iamRes = await fetch("https://iam.cloud.ibm.com/identity/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${apikey}`
  });
  
  const iamData = await iamRes.json();
  const token = iamData.access_token;
  console.log("Got token.");

  for (const p of paths) {
    const url = base + p;
    console.log(`\nTesting URL: ${url}`);
    try {
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
      console.log(`Body: ${text.substring(0, 150)}`);
    } catch (err) {
      console.error(err);
    }
  }
}

testUrls();
