import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const dateTimeTool = createTool({
	id: "get-datetime",
	description: "Get current date and time",
	inputSchema: z.object({
		format: z.enum(["iso", "readable", "date-only", "time-only"])
			.optional()
			.default("iso")
			.describe("Format for the date/time output"),
	}),
	outputSchema: z.object({
		datetime: z.string(),
		timezone: z.string(),
		timestamp: z.number(),
	}),
	execute: async ({ context }) => {
		const now = new Date();
		const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		let formatted: string;

		switch (context.format) {
			case "readable":
				formatted = now.toLocaleString();
				break;
			case "date-only":
				formatted = now.toISOString().split('T')[0];
				break;
			case "time-only":
				formatted = now.toLocaleTimeString();
				break;
			default:
				formatted = now.toISOString();
		}

		return {
			datetime: formatted,
			timezone,
			timestamp: now.getTime(),
		};
	},
});