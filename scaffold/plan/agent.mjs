// agent.mjs — agent mode (D-68): in the skill, the agent running it is the model.
//
// Every model step of the v2 scripts sends one chat request through a fetch function. In agent
// mode that fetch is `agentFetch`: it writes the request as a task file the agent can read
// (<tasks>/<call>.task.md, its images beside it as files), and stops the script with
// AwaitingAgent. The agent does the work in its own session and writes the answer file
// (<tasks>/<call>.answer.json for a JSON step, .answer.txt for a text step). Run the same command
// again: the fetch finds the answer and returns it in the provider's response shape, so the step
// validates it exactly as it validates an API answer (schema, retries, repairs). An answer that
// fails validation stops the script with the reason; the agent corrects the file and runs again.
//
// Turn it on with ULTRADEMO_MODE=agent (the skill sets it) or a script's --agent flag. Tasks go to
// ULTRADEMO_TASKS_DIR, else <project>/tasks (each step sets it from its project folder).
// Nothing here reads a key or touches the network.

import fs from 'node:fs';
import path from 'node:path';

export const agentMode = () => process.env.ULTRADEMO_MODE === 'agent';

/** Point the tasks at a project unless something already did. */
export function useProjectTasks(projectDir) {
  if (!process.env.ULTRADEMO_TASKS_DIR) process.env.ULTRADEMO_TASKS_DIR = path.join(path.resolve(projectDir), 'tasks');
  return process.env.ULTRADEMO_TASKS_DIR;
}

/** The script stops here until the agent has written the answer. */
export class AwaitingAgent extends Error {
  constructor(task, answer) {
    super(`Waiting for the agent: read ${task}, write the answer to ${answer}, then run the same command again.`);
    this.name = 'AwaitingAgent';
    this.task = task;
    this.answer = answer;
  }
}

const CALL_HEADER = 'x-ultrademo-call';
export const taskName = (name) => String(name || 'call').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();

/** The text of a message's content (a string, or text parts) and its images. */
function partsOf(content) {
  if (typeof content === 'string') return { text: content, images: [] };
  const text = [];
  const images = [];
  let label = '';
  for (const p of content || []) {
    if (p.type === 'text') { text.push(p.text); label = p.text; }
    else if (p.type === 'image_url') images.push({ label, url: p.image_url?.url || '' });
  }
  return { text: text.join('\n\n'), images };
}

/** Write the task file for one request; returns { task, answer, format }. */
export function writeTask(dir, name, body) {
  fs.mkdirSync(dir, { recursive: true });
  const slug = taskName(name);
  const json = body.response_format?.type === 'json_schema' || /Return only one JSON object/.test(String(body.messages?.[0]?.content || ''));
  const format = json ? 'json' : 'text';
  const task = path.join(dir, `${slug}.task.md`);
  const answer = path.join(dir, `${slug}.answer.${format === 'json' ? 'json' : 'txt'}`);
  const system = partsOf(body.messages?.find((m) => m.role === 'system')?.content).text;
  const user = partsOf(body.messages?.find((m) => m.role === 'user')?.content);
  const imageLines = [];
  user.images.forEach((im, i) => {
    const m = /^data:image\/(\w+);base64,(.*)$/s.exec(im.url);
    if (!m) return;
    const file = path.join(dir, `${slug}-image-${i + 1}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
    fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
    imageLines.push(`- ${file}${im.label ? ` (${String(im.label).slice(0, 160).replace(/\s+/g, ' ')})` : ''}`);
  });
  const schema = body.response_format?.json_schema?.schema;
  const doc = [
    `# Task: ${name}`,
    '',
    `Status: waiting for the agent. Write the answer to \`${answer}\` and run the same command again.`,
    '',
    format === 'json'
      ? 'Answer format: one JSON object, no prose and no code fence, matching the schema at the end of this file exactly (every property present; null where allowed).'
      : 'Answer format: plain text exactly as the prompt asks (for files, the delimiters the prompt names). No commentary before or after.',
    '',
    '## Instructions (the step\'s system prompt)',
    '',
    system,
    '',
    '## Request',
    '',
    user.text,
    ...(imageLines.length ? ['', '## Images (open each one before answering)', '', ...imageLines] : []),
    ...(schema ? ['', '## Answer schema', '', '```json', JSON.stringify(schema, null, 1), '```'] : []),
    '',
  ].join('\n');
  fs.writeFileSync(task, doc);
  return { task, answer, format };
}

/**
 * A fetch that answers from the agent's files. Use as `fetchImpl` with any key.
 * @param {string} [dir] the tasks folder (default ULTRADEMO_TASKS_DIR)
 */
/** Tokens a task used, estimated: its text and pictures in, the answer out. */
export function estimateUsage(body, answerText = '') {
  let chars = 0, images = 0;
  for (const m of body?.messages || []) {
    if (typeof m.content === 'string') chars += m.content.length;
    else for (const p of m.content || []) { if (p.type === 'text') chars += (p.text || '').length; else if (p.type === 'image_url') images++; }
  }
  return { prompt_tokens: Math.ceil(chars / 4) + images * 1600, completion_tokens: Math.ceil(String(answerText).length / 4) };
}

export function agentFetch(dir = process.env.ULTRADEMO_TASKS_DIR) {
  if (!dir) throw new Error('agent mode needs a tasks folder (ULTRADEMO_TASKS_DIR or the project folder)');
  const seen = new Map();
  return async (url, init) => {
    const body = JSON.parse(init.body);
    const name = init?.headers?.[CALL_HEADER] || 'call';
    const { task, answer } = writeTask(dir, name, body);
    if (!fs.existsSync(answer)) throw new AwaitingAgent(task, answer);
    // a second request for the same call in one run is the step asking for a correction: the file has not changed, so say so plainly
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    const text = fs.readFileSync(answer, 'utf8');
    if (n > 1) {
      // the step appends its correction to the end of the first text part of the request
      const content = body.messages?.find((m) => m.role === 'user')?.content;
      const first = typeof content === 'string' ? content : (content || []).find((p) => p.type === 'text')?.text || '';
      const ask = first.split('\n\n').slice(-1)[0].slice(0, 1200);
      const e = new Error(`${name}: the answer in ${answer} did not pass the step's check. The step said: ${ask} Correct the file and run the same command again.`);
      e.agent = true;
      throw e;
    }
    // no bill per call (the agent is the model, on the user's own plan); the tokens are estimated from what it read and
    // wrote: about four characters a token, about 1,600 a picture
    const usage = estimateUsage(body, text);
    return new Response(JSON.stringify({
      id: `agent-${taskName(name)}`,
      choices: [{ message: { content: text }, finish_reason: 'stop' }],
      usage: { ...usage, cost: 0, estimated: true },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

/** For a script's main: print the waiting message and exit 3 (not an error: the agent's turn). */
export function exitIfAwaiting(err) {
  if (err instanceof AwaitingAgent || err?.name === 'AwaitingAgent') {
    console.log(err.message);
    process.exit(3);
  }
  if (err?.agent) {
    console.error(err.message);
    process.exit(4);
  }
}
