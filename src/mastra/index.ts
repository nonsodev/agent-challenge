import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { projectManagerAgent } from "./agents/project-manager-agent/project-manager-agent";
import { trelloWorkflow } from "./agents/project-manager-agent/trello-workflow";
import { jiraWorkflow } from "./agents/project-manager-agent/jira-workflow";

export const mastra = new Mastra({
	workflows: {trelloWorkflow, jiraWorkflow},
	agents: { projectManagerAgent },
	logger: new PinoLogger({
		name: "Mastra",
		level: "info",
	}),
	server: {
		port: 8080,
		timeout: 10000,
	},
});