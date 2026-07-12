import { config } from 'dotenv';
config();
import { OrchestrateClient } from './apps/api/src/services/orchestrate.client';

async function test() {
  console.log("Testing Orchestrate Client...");
  console.log("URL:", process.env.IBM_ORCHESTRATE_URL);
  
  if (!process.env.IBM_ORCHESTRATE_URL) {
    console.error("No IBM_ORCHESTRATE_URL set");
    return;
  }
  
  const client = new OrchestrateClient({
    agentUrl: process.env.IBM_ORCHESTRATE_URL,
    apiKey: process.env.IBM_ORCHESTRATE_API_KEY || '',
    bearerToken: process.env.IBM_ORCHESTRATE_BEARER_TOKEN
  });
  
  try {
    const isHealthy = await client.ping();
    console.log("Ping successful:", isHealthy);
    
    console.log("Sending 'hey' to agent...");
    await client.run({
      chatId: 'test-chat-id',
      userId: 'test-user',
      userMessage: 'hey',
      chatHistory: [],
      onEvent: (event) => {
        console.log("Received event:", JSON.stringify(event));
      },
      executeToolFn: async () => [],
      requestPermissionFn: async () => false
    });
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
