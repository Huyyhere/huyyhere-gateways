import { NextResponse } from "next/server";
import { fetchAndCheckClaudeKeys } from "@/lib/keyFetcher";
import { updateClaudeKeys } from "@/lib/autoRefresh";
import { discoverAndAddNewModels } from "@/lib/modelUpdater";
import { modelMap } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  const results = await fetchAndCheckClaudeKeys();
  const validKeys = await updateClaudeKeys(results);
  const newKeys = validKeys.map((k) => `${k.slice(0, 8)}...`);

  const newModels = await discoverAndAddNewModels();
  const addedModels = newModels.filter((m) => m.added);

  return NextResponse.json({
    success: validKeys.length > 0,
    claude: {
      total: results.length,
      valid: validKeys.length,
      invalid: results.length - validKeys.length,
    },
    models: {
      total: Object.keys(modelMap).length,
      new_added: addedModels.map((m) => m.model),
    },
  });
}
