import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const envFiles = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
  ".env.development",
  ".env.development.local",
  ".env.test",
  ".env.test.local",
];
const secretName = /(?:^|_)(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY)(?:_|$)/;

/** OpenNext compiles these dotenv files into every Worker, including development mode. */
export function findBundledSecretSettings(repositoryRoot, appRoot) {
  const problems = [];
  for (const directory of new Set([repositoryRoot, appRoot])) {
    for (const name of envFiles) {
      const file = resolve(directory, name);
      if (!existsSync(file)) continue;
      for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
        if (secretName.test(key) && value.trim())
          problems.push({ file: relative(repositoryRoot, file), key });
      }
    }
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const problems = findBundledSecretSettings(repositoryRoot, process.cwd());
  if (problems.length) {
    console.error(
      "OpenNext would inline credentials from dotenv files. Keep secrets only in .dev.vars or Cloudflare Secrets:",
    );
    for (const problem of problems) console.error(`${problem.file}: ${problem.key}`);
    process.exitCode = 1;
  }
}
