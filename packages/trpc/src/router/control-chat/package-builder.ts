import { strToU8, zipSync } from "fflate";

function slugify(value: string): string {
	const slug = value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 72);
	return slug || "generated-capability";
}

function semverFromNow(): string {
	const now = new Date();
	const patch =
		now.getUTCFullYear() * 10_000 +
		(now.getUTCMonth() + 1) * 100 +
		now.getUTCDate();
	return `1.0.${patch}`;
}

function dataUrlFromFiles(files: Record<string, string>): string {
	const zipped = zipSync(
		Object.fromEntries(
			Object.entries(files).map(([path, content]) => [path, strToU8(content)]),
		),
	);
	return `data:application/zip;base64,${Buffer.from(zipped).toString("base64")}`;
}

export function buildGeneratedSkillPackage(args: {
	name: string;
	description?: string;
	instruction: string;
	sourceRef?: string;
}) {
	const slug = slugify(args.name);
	const version = semverFromNow();
	const description =
		args.description?.trim() ||
		`Chat-generated Skill package for ${args.name.trim()}.`;
	const skillMarkdown = `# ${args.name.trim()}

## Purpose

${description}

## Instructions

${args.instruction.trim()}

## Usage Notes

- Treat this Skill as a methodology package created from a Control Chat request.
- Keep project-specific facts outside this Skill unless the user explicitly asks to encode them.
- When changing this Skill, create a new capability package version instead of editing artifacts in place.
`;
	const manifest = {
		manifestVersion: 1,
		id: slug,
		type: "skill",
		name: args.name.trim(),
		version,
		description,
		entry: "skill",
		keywords: ["control-chat", "generated"],
		display: {
			summary: description,
			overviewMarkdown: skillMarkdown,
			intendedUsers: ["Superset users"],
			useCases: ["Chat-managed methodology"],
		},
		skill: {
			entryFile: "SKILL.md",
			targets: ["codex"],
			activation: args.instruction.trim().slice(0, 2000),
			categories: ["generated"],
		},
	};

	const fileData = dataUrlFromFiles({
		"superset.capability.json": JSON.stringify(manifest, null, 2),
		"skill/SKILL.md": skillMarkdown,
		"README.md": skillMarkdown,
	});

	return {
		filename: `${slug}-${version}.zip`,
		fileData,
		sourceRef: args.sourceRef ?? "control-chat:generated-skill",
		summary: description,
	};
}

export function buildGeneratedCliPackage(args: {
	name: string;
	description?: string;
	instruction: string;
	sourceUrl?: string;
	sourceRef?: string;
}) {
	const slug = slugify(args.name);
	const commandName = slug.slice(0, 48);
	const version = semverFromNow();
	const description =
		args.description?.trim() ||
		`Chat-generated CLI package for ${args.name.trim()}.`;
	const sourceUrl = args.sourceUrl?.trim();
	const binScript = `#!/usr/bin/env node

const sourceUrl = ${JSON.stringify(sourceUrl ?? null)};
const instruction = ${JSON.stringify(args.instruction.trim())};

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(\`${args.name.trim()}

Instruction:
\${instruction}

Usage:
  ${commandName} [--json]
\`);
    return;
  }

  const result = {
    name: ${JSON.stringify(args.name.trim())},
    sourceUrl,
    instruction,
    fetched: null,
  };

  if (sourceUrl) {
    const response = await fetch(sourceUrl);
    const text = await response.text();
    result.fetched = {
      status: response.status,
      contentType: response.headers.get("content-type"),
      text: text.slice(0, 12000),
    };
  }

  if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(result.name);
  if (sourceUrl) console.log(\`Source: \${sourceUrl}\`);
  console.log("");
  console.log(result.instruction);
  if (result.fetched) {
    console.log("");
    console.log("--- fetched excerpt ---");
    console.log(result.fetched.text);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
`;
	const manifest = {
		manifestVersion: 1,
		id: slug,
		type: "cli",
		name: args.name.trim(),
		version,
		description,
		entry: "tool",
		keywords: ["control-chat", "generated"],
		display: {
			summary: description,
			overviewMarkdown: `# ${args.name.trim()}\n\n${description}\n\n${args.instruction.trim()}`,
			intendedUsers: ["Superset users"],
			useCases: ["Chat-generated CLI automation"],
		},
		cli: {
			install: {
				strategy: "none",
				commands: [],
			},
			commands: [
				{
					name: commandName,
					bin: `bin/${commandName}.mjs`,
					title: args.name.trim(),
					description,
					examples: [`${commandName} --help`, `${commandName} --json`],
					commandExamples: [`${commandName} --json`],
				},
			],
			env: [],
			network: Boolean(sourceUrl),
		},
	};
	const packageJson = {
		type: "module",
		private: true,
		bin: {
			[commandName]: `bin/${commandName}.mjs`,
		},
	};
	const readme = `# ${args.name.trim()}

${description}

## Instruction

${args.instruction.trim()}
`;

	const fileData = dataUrlFromFiles({
		"superset.capability.json": JSON.stringify(manifest, null, 2),
		"tool/package.json": JSON.stringify(packageJson, null, 2),
		[`tool/bin/${commandName}.mjs`]: binScript,
		"README.md": readme,
	});

	return {
		filename: `${slug}-${version}.zip`,
		fileData,
		sourceRef: args.sourceRef ?? sourceUrl ?? "control-chat:generated-cli",
		summary: description,
	};
}
