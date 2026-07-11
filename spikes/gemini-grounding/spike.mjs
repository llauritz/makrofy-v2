// PROTOTYPE (issue #20) — throwaway shell. Run: npm run spike | node spike.mjs "food"
import { initializeApp } from "firebase/app";
import { getAI, GoogleAIBackend, VertexAIBackend } from "firebase/ai";
import {
  MODEL_ID,
  makeCombinedModel,
  makeUngroundedModel,
  makeGroundedTextModel,
  fillMacrosCombined,
  fillMacrosTwoStep,
} from "./macro-fill.mjs";

// Public web-app config (ships in the bundle by design) — issue #12 resolution.
const firebaseConfig = {
  apiKey: "AIzaSyCwPvXKwYBTQGX4rXOEPLfLjP276WAzn8Y",
  authDomain: "goyaffle.firebaseapp.com",
  projectId: "goyaffle",
  storageBucket: "goyaffle.firebasestorage.app",
  messagingSenderId: "133375256638",
  appId: "1:133375256638:web:3bbb7bd45b92770d1c496f",
};

// --- App Check: AI Logic is auto-enforced on goyaffle (finding of this spike).
// Node has no reCAPTCHA, so mimic the SDK's debug provider: exchange the debug
// token (env APPCHECK_DEBUG_TOKEN, value never printed) for an App Check JWT
// and attach it as the X-Firebase-AppCheck header via the fetch tap below.
let appCheckJwt = null;
async function obtainAppCheckToken() {
  const debugToken = process.env.APPCHECK_DEBUG_TOKEN;
  if (!debugToken) {
    console.log("(no APPCHECK_DEBUG_TOKEN set — calling without App Check)");
    return;
  }
  const res = await realFetch(
    `https://firebaseappcheck.googleapis.com/v1/projects/${firebaseConfig.projectId}/apps/${firebaseConfig.appId}:exchangeDebugToken?key=${firebaseConfig.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ debugToken }),
    },
  );
  if (!res.ok) throw new Error(`exchangeDebugToken failed: ${res.status} ${await res.text()}`);
  const { ttl } = (({ token, ttl }) => ((appCheckJwt = token), { ttl }))(await res.json());
  console.log(`(App Check debug token exchanged OK, ttl ${ttl})`);
}

// --- fetch tap: capture what the SDK actually sends to the AI Logic proxy ---
const sentRequests = [];
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.includes("firebasevertexai.googleapis.com")) {
    sentRequests.push({ url, body: init?.body ?? null });
    if (appCheckJwt) {
      const headers = new Headers(init?.headers);
      headers.set("X-Firebase-AppCheck", appCheckJwt);
      init = { ...init, headers };
    }
  }
  return realFetch(input, init);
};
function lastRequestFacts() {
  const req = sentRequests[sentRequests.length - 1];
  if (!req?.body) return { tapped: false };
  const body = JSON.parse(req.body);
  return {
    tapped: true,
    url: req.url.split("?")[0],
    hasGoogleSearchTool: Boolean(
      body.tools?.some((t) => "googleSearch" in t),
    ),
    hasResponseSchema: Boolean(body.generationConfig?.responseSchema),
    responseMimeType: body.generationConfig?.responseMimeType ?? null,
  };
}

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

function printReport(title, rep) {
  console.log(`\n${bold(`── ${title} `.padEnd(72, "─"))}`);
  console.log(`${bold("input")}        ${rep.description}`);
  console.log(`${bold("latency")}      ${rep.latencyMs} ms${rep.twoStep ? dim(`  (step1 ${rep.twoStep.step1Ms} ms + step2 ${rep.twoStep.step2Ms} ms)`) : ""}`);
  const wire = lastRequestFacts();
  if (wire.tapped) {
    console.log(
      `${bold("wire")}         googleSearch tool: ${wire.hasGoogleSearchTool ? green("sent") : dim("absent")}   responseSchema: ${wire.hasResponseSchema ? green("sent") : dim("absent")}   mime: ${wire.responseMimeType ?? dim("none")}`,
    );
  }
  if (rep.parseError) {
    console.log(`${bold("parse")}        ${red("FAILED")} ${rep.parseError}`);
    console.log(`${bold("raw text")}     ${rep.rawText.slice(0, 400)}`);
  } else {
    console.log(`${bold("status")}       ${green(rep.parsed.status)}`);
    console.log(`${bold("json")}         ${JSON.stringify(rep.parsed)}`);
  }
  const g = rep.grounding;
  if (g.grounded) {
    console.log(
      `${bold("grounding")}    queries: ${JSON.stringify(g.webSearchQueries)}  chunks: ${g.groundingChunkCount}  searchEntryPoint: ${g.hasSearchEntryPoint ? green(`yes (${g.searchEntryPointChars} chars)`) : red("no")}`,
    );
  } else {
    console.log(`${bold("grounding")}    ${dim("no groundingMetadata on response")}`);
  }
  console.log(
    `${dim(`finish: ${rep.finishReason}  tokens: prompt ${rep.usage?.promptTokenCount ?? "?"} / out ${rep.usage?.candidatesTokenCount ?? "?"} / total ${rep.usage?.totalTokenCount ?? "?"}`)}`,
  );
  if (rep.twoStep) {
    console.log(`${bold("step1 text")}   ${dim(rep.twoStep.groundedText.slice(0, 300).replaceAll("\n", " "))}`);
  }
}

const useVertex = process.argv.includes("--vertex");
const app = initializeApp(firebaseConfig);
const ai = getAI(app, {
  backend: useVertex ? new VertexAIBackend("us-central1") : new GoogleAIBackend(),
});
const combined = makeCombinedModel(ai);
const ungrounded = makeUngroundedModel(ai);
const groundedText = makeGroundedTextModel(ai);

const args = process.argv.slice(2);
const twoStepFlag = args.includes("--two-step");
const suite = args.includes("--suite") || args.length === 0;
const adhoc = args.filter((a) => !a.startsWith("--")).join(" ");

const STAPLE = "10g butter";
const BRANDED = "one 124g pot of Müller Corner strawberry yoghurt";

async function probeCombined(title, input) {
  try {
    printReport(title, await fillMacrosCombined(combined, input));
    return true;
  } catch (e) {
    console.log(`\n${bold(`── ${title} `.padEnd(72, "─"))}`);
    console.log(`${red("COMBINED REQUEST REJECTED")} — this is the finding:`);
    console.log(String(e));
    const wire = lastRequestFacts();
    if (wire.tapped) console.log("wire facts:", wire);
    return false;
  }
}

async function probeTwoStep(title, input) {
  try {
    printReport(`${title} [two-step fallback]`, await fillMacrosTwoStep(groundedText, ungrounded, input));
  } catch (e) {
    console.log(`\n${red("two-step fallback ALSO failed:")} ${String(e)}`);
  }
}

console.log(dim(`model: ${MODEL_ID}  sdk: firebase@12.16.0 (firebase/ai, ${useVertex ? "VertexAIBackend us-central1" : "GoogleAIBackend"})  project: goyaffle`));
await obtainAppCheckToken();

if (twoStepFlag) {
  await probeTwoStep("ad-hoc", adhoc || STAPLE);
} else if (!suite && adhoc) {
  const ok = await probeCombined("ad-hoc grounded+schema", adhoc);
  if (!ok) await probeTwoStep("ad-hoc", adhoc);
} else {
  const okStaple = await probeCombined(`staple, grounded+schema`, STAPLE);
  const okBranded = await probeCombined(`branded, grounded+schema`, BRANDED);

  try {
    printReport(`staple, ungrounded+schema (baseline)`, await fillMacrosCombined(ungrounded, STAPLE));
    printReport(`branded, ungrounded+schema (baseline)`, await fillMacrosCombined(ungrounded, BRANDED));
  } catch (e) {
    console.log(`\n${red("ungrounded baseline failed:")} ${String(e)}`);
  }

  if (!okStaple || !okBranded) {
    console.log(`\n${bold("Combined unsupported → measuring the documented two-step fallback shape:")}`);
    await probeTwoStep("staple", STAPLE);
    await probeTwoStep("branded", BRANDED);
  }
}

process.exit(0);
