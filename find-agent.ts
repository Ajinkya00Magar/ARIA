import { config } from 'dotenv';
config();

async function findAgentId() {
  const apikey = process.env.IBM_ORCHESTRATE_API_KEY;
  const baseUrl = "https://api.us-south.watson-orchestrate.cloud.ibm.com/instances/cb5cfdd8-941b-42c0-b2a6-b4f38a6e55a3";
  
  console.log("Fetching IAM token...");
  const iamRes = await fetch("https://iam.cloud.ibm.com/identity/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${apikey}`
  });
  const token = (await iamRes.json()).access_token;
  console.log("Got token.");

  const pathsToTest = [
    "/v1/agents",
    "/v2/assistants",
    "/v1/orchestrate/agents",
    "/v1/skills",
    "/v1/assistants"
  ];

  for (const path of pathsToTest) {
    const url = baseUrl + path;
    console.log(`\nTrying GET ${url}`);
    try {
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const text = await res.text();
      console.log(`Status: ${res.status}`);
      if (res.ok) {
        console.log("Success! Response:");
        console.log(text);
        return; // Stop if we found it
      } else {
        console.log(`Body snippet: ${text.substring(0, 100)}`);
      }
    } catch (e) {
      console.error("Error:", e.message);
    }
  }
}

findAgentId();
