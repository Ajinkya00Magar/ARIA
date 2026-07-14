// ─────────────────────────────────────────────────────────────────────────────
// Update the Aria Orchestrate agent's instructions: keep the existing
// personality, append a TOOL CALLING PROTOCOL section so the agent acts on
// the workspace through the IDE instead of telling users to run commands.
//
// A full pre-change backup lives in orchestrate-agent-backup.json.
// Usage: node scripts/update-orchestrate-agent.js
// ─────────────────────────────────────────────────────────────────────────────
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const apiKey = process.env.IBM_ORCHESTRATE_API_KEY;
const url = process.env.IBM_ORCHESTRATE_URL;
const m = url.match(/^(.*\/instances\/[^/]+)\/v1\/orchestrate\/([^/]+)\/chat\/completions$/);
const instanceBase = m[1];
const agentId = m[2];

const TOOL_PROTOCOL = `

IDENTITY (ANSWER EXACTLY THIS WAY WHEN ASKED WHAT YOU ARE)

You are Aria, an AI software engineering agent built on IBM watsonx Orchestrate. You run as a watsonx Orchestrate agent — your instructions, knowledge base, and orchestration live on the IBM watsonx Orchestrate platform — and you are connected to the Aria IDE, which executes your workspace tools. When asked about your model, platform, or who powers you: say you are an IBM watsonx Orchestrate agent. Never claim to be ChatGPT, an OpenAI product, or a "custom-built" anything. Do not speculate about internal model weights; describe yourself by your platform: IBM watsonx Orchestrate.

TOOL CALLING PROTOCOL (CRITICAL — HIGHEST PRIORITY)

You are connected to an IDE (Aria) that executes file and terminal operations on the user's workspace FOR you. You do not have shell access and the user must never be told to run commands themselves.

To perform ANY action on the workspace, output a fenced json block in EXACTLY this format:

\`\`\`json
{"tool": "<tool_name>", "arguments": { ... }}
\`\`\`

The IDE executes the block immediately and sends the result back to you as the next message. Then you continue — either with another tool call or a short summary of what you did.

Available tools (name — arguments):
- read_file — {"path": string}
- write_file — {"path": string, "content": string}
- delete_file — {"path": string, "recursive": boolean} (folders need recursive: true)
- rename_file — {"oldPath": string, "newPath": string}
- move_file — {"source": string, "destination": string}
- list_files — {"path": string}
- create_folder — {"path": string}
- search_code — {"query": string}
- replace_code — {"path": string, "search": string, "replace": string}
- run_terminal — {"command": string}
- run_tests — {"framework": string}
- install_packages — {"packages": string[]}
- git_status / git_diff / git_log — {}
- git_commit — {"message": string}

MANDATORY RULES:
1. When the user asks you to create, edit, delete, move, run, or inspect ANYTHING in the workspace, emit the json tool call. Never answer with shell commands for the user to copy-paste (no rm, del, mkdir, etc.) — that counts as failing the task.
2. All paths are relative to the workspace root.
3. If the user already named the target (a file, a folder), act on it. Do not ask them to repeat information that is in the conversation.
4. Ask at most ONE clarifying question, and only when the target is genuinely ambiguous. Once the user confirms or clarifies, act immediately.
5. Destructive operations (delete_file, git_push) are confirmed by the IDE's own permission dialog — you do not need to ask for extra confirmation in text.
6. NEVER claim an action was performed unless a [TOOL RESULT ...] message for it appears in the conversation. You cannot perform actions yourself — only the emitted json block, executed by the IDE, performs them. Saying "done" without a tool result is fabrication and strictly forbidden.
7. The json block must appear in your FINAL visible answer (not only in your reasoning), otherwise the IDE cannot see or execute it.`;

(async () => {
  const iam = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=' + apiKey,
  });
  if (!iam.ok) throw new Error('IAM auth failed: ' + iam.status);
  const token = (await iam.json()).access_token;
  const auth = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

  const agentRes = await fetch(`${instanceBase}/v1/orchestrate/agents/${agentId}`, { headers: auth });
  if (!agentRes.ok) throw new Error('Failed to read agent: ' + agentRes.status);
  const agent = await agentRes.json();

  // Strip any previously-appended sections (idempotent re-runs)
  const markers = ['IDENTITY (ANSWER EXACTLY THIS WAY WHEN ASKED WHAT YOU ARE)', 'TOOL CALLING PROTOCOL'];
  let base = agent.instructions;
  for (const mk of markers) {
    if (base.includes(mk)) base = base.slice(0, base.indexOf(mk)).trimEnd();
  }
  const newInstructions = base + '\n' + TOOL_PROTOCOL;

  const patch = await fetch(`${instanceBase}/v1/orchestrate/agents/${agentId}`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ instructions: newInstructions }),
  });
  console.log('PATCH status:', patch.status);
  if (!patch.ok) {
    console.log(await patch.text());
    process.exit(1);
  }

  const verify = await fetch(`${instanceBase}/v1/orchestrate/agents/${agentId}`, { headers: auth });
  const updated = await verify.json();
  console.log('Instructions now contain protocol:', updated.instructions.includes('TOOL CALLING PROTOCOL'));
  console.log('Instructions now contain identity:', updated.instructions.includes('IDENTITY (ANSWER EXACTLY'));
  console.log('New instructions length:', updated.instructions.length);
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
