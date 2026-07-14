import { config } from 'dotenv';
config();

async function findAria() {
  const apikey = process.env.IBM_ORCHESTRATE_API_KEY;
  const baseUrl = "https://api.us-south.watson-orchestrate.cloud.ibm.com/instances/cb5cfdd8-941b-42c0-b2a6-b4f38a6e55a3";
  
  const iamRes = await fetch("https://iam.cloud.ibm.com/identity/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${apikey}`
  });
  const token = (await iamRes.json()).access_token;

  const url = baseUrl + "/v1/orchestrate/agents";
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  const agents = await res.json();
  
  const aria = agents.find(a => a.display_name === 'Aria');
  if (aria) {
    console.log("Found Aria!");
    console.log("Agent ID:", aria.id);
    console.log("Full Chat URL:", `${baseUrl}/v1/orchestrate/agents/${aria.id}/chat`);
  } else {
    console.log("Could not find an agent named Aria. Agents found:", agents.map(a => a.display_name));
  }
}

findAria();
