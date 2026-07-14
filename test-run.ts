import { config } from 'dotenv';
config();
import { agentService } from './apps/api/src/services/agent.service';

async function testRun() {
  console.log("Starting run...");
  try {
    await agentService.run({
      chatId: "test-chat",
      workspaceId: "",
      userId: "test-user",
      userMessage: "hello",
      onEvent: (e) => {
        console.log("EVENT:", e.type);
        if (e.type === 'agent_error') console.log("ERROR DATA:", e.data);
      },
      pendingPermissions: new Map()
    });
    console.log("Run finished.");
  } catch (err) {
    console.error("Crash:", err);
  }
}

testRun();
