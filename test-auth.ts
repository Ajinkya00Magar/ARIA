// Using global fetch

async function testAuth() {
  const url = "https://api.us-south.watson-orchestrate.cloud.ibm.com/instances/cb5cfdd8-941b-42c0-b2a6-b4f38a6e55a3/v1/chat";
  const apikey = "ApiKey-4addad61-5cc1-4d19-a661-b9f31e26b88c";

  const headersToTest = [
    { 'X-API-Key': apikey },
    { 'Authorization': `Bearer ${apikey}` },
    { 'Authorization': `Basic ${Buffer.from(`apikey:${apikey}`).toString('base64')}` },
    { 'IAM-API-KEY': apikey },
    { 'iam-apikey': apikey },
    { 'IAM-API_KEY': apikey },
    { 'iam_api_key': apikey }
  ];

  for (const headers of headersToTest) {
    console.log(`\nTesting headers:`, Object.keys(headers)[0]);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({ input: 'hey' })
      });
      const text = await res.text();
      console.log(`Status: ${res.status}`);
      console.log(`Body: ${text.substring(0, 200)}`);
    } catch (err) {
      console.error(err);
    }
  }
}

testAuth();
