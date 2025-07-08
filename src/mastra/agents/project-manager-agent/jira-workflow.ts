import { Agent } from "@mastra/core/agent";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { model } from "../../config";
import { jiraTool } from "./jira-tool";
import { documentExportTool } from "./document-export-tool";

const projectAgent = new Agent({
  name: "Project Enhancement Agent",
  model,
  instructions: `
    You are a proactive project management expert specializing in enhancing and structuring Jira projects.

    Your role is to:
    1. Analyze existing project structures and identify gaps, unclear requirements, or optimization opportunities
    2. Enhance task descriptions with clear acceptance criteria and better structure
    3. Create logical task hierarchies (Epic → Story → Task → Subtask)
    4. Suggest realistic effort estimates and proper priority levels
    5. Identify missing dependencies and role assignments
    6. Ensure all tasks are actionable with clear outcomes

    For new projects from messy input:
    - Extract clear project goals and scope
    - Structure into logical epics and stories
    - Break down into specific, actionable tasks
    - Add realistic timelines and dependencies
    - Suggest appropriate team roles and assignments

    Guidelines:
    - Keep descriptions clear and concise
    - Add acceptance criteria for all stories
    - Use proper Jira issue types (Epic, Story, Task, Bug)
    - Consider team capacity and realistic timelines
    - Flag any unclear requirements or missing information
    - Maintain focus on deliverable outcomes

    Always be specific about what needs to be done, by when, and by whom.
  `,
  tools: [jiraTool, documentExportTool],
});

const readAndEnhanceProject = createStep({
  id: "read-and-enhance-project",
  description: "Reads source project (if provided) and enhances it, or creates from messy input",
  inputSchema: z.object({
    sourceProjectKey: z.string().optional().describe("Source project key to read from"),
    messyInput: z.string().optional().describe("Raw project description if no source project"),
  }),
  outputSchema: z.object({
    enhancedTasks: z.array(z.object({
      title: z.string(),
      description: z.string(),
      type: z.enum(["Story", "Task", "Bug", "Epic"]),
      assignee: z.string().optional(),
      epic: z.string().optional(),
      sprint: z.string().optional(),
      dueDate: z.string().optional(),
      blocks: z.string().optional(),
    })),
    recommendations: z.string(),
  }),
  execute: async ({ inputData }) => {
    let prompt = "";
    let projectData = null;

    // Read source project if provided
    if (inputData.sourceProjectKey) {
      const result = await jiraTool.execute({
        action: "read",
        projectKey: inputData.sourceProjectKey,
      });

      if (!result.success) {
        throw new Error(`Failed to read project: ${result.error}`);
      }

      projectData = result.data;
      prompt = `Analyze this Jira project and enhance it:
        
        Project Data: ${JSON.stringify(projectData, null, 2)}
        
        Please:
        1. Identify gaps, unclear requirements, or missing details
        2. Enhance task descriptions with clear acceptance criteria
        3. Suggest better task structures and dependencies
        4. Add realistic effort estimates and priorities
        5. Recommend improvements to project organization
        
        Return the enhanced tasks and your recommendations.`;
    } else if (inputData.messyInput) {
      // Creating from messy input
      prompt = `Transform this messy project description into a well-structured Jira project:
        
        Input: ${inputData.messyInput}
        
        Please:
        1. Extract clear project goals and scope
        2. Structure into logical epics and stories
        3. Break down into specific, actionable tasks
        4. Add realistic timelines and dependencies
        5. Suggest appropriate team roles and assignments
        
        Return the structured tasks and your recommendations.`;
    } else {
      throw new Error("Either sourceProjectKey or messyInput must be provided");
    }

    const response = await projectAgent.stream([
      {
        role: "user",
        content: prompt,
      },
    ]);

    let enhancementText = "";
    for await (const chunk of response.textStream) {
      enhancementText += chunk;
    }

    // Extract structured data from response (you might want to use a more sophisticated parser)
    const enhancedTasks = [
      {
        title: "Enhanced Task Example",
        description: "This would be generated from the AI response",
        type: "Task" as const,
      },
    ];

    return {
      enhancedTasks,
      recommendations: enhancementText,
    };
  },
});

const enhanceProject = createStep({
  id: "enhance-project",
  description: "Analyzes and enhances the project structure",
  inputSchema: z.object({
    enhancedTasks: z.array(z.object({
      title: z.string(),
      description: z.string(),
      type: z.enum(["Story", "Task", "Bug", "Epic"]),
      assignee: z.string().optional(),
      epic: z.string().optional(),
      sprint: z.string().optional(),
      dueDate: z.string().optional(),
      blocks: z.string().optional(),
    })),
    recommendations: z.string(),
  }),
  outputSchema: z.object({
    enhancedTasks: z.array(z.object({
      title: z.string(),
      description: z.string(),
      type: z.enum(["Story", "Task", "Bug", "Epic"]),
      assignee: z.string().optional(),
      epic: z.string().optional(),
      sprint: z.string().optional(),
      dueDate: z.string().optional(),
      blocks: z.string().optional(),
    })),
    recommendations: z.string(),
  }),
  execute: async ({ inputData }) => {
    // Pass through the enhanced data
    return {
      enhancedTasks: inputData.enhancedTasks,
      recommendations: inputData.recommendations,
    };
  },
});

const writeEnhancedProject = createStep({
  id: "write-enhanced-project",
  description: "Writes the enhanced project to the target Jira project",
  inputSchema: z.object({
    targetProjectKey: z.string().describe("Target project key to write to"),
    enhancedTasks: z.array(z.object({
      title: z.string(),
      description: z.string(),
      type: z.enum(["Story", "Task", "Bug", "Epic"]),
      assignee: z.string().optional(),
      epic: z.string().optional(),
      sprint: z.string().optional(),
      dueDate: z.string().optional(),
      blocks: z.string().optional(),
    })),
    exportFallback: z.boolean().default(false),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.any(),
    fallbackExport: z.string().optional(),
  }),
  execute: async ({ inputData }) => {
    try {
      const result = await jiraTool.execute({
        action: "write",
        projectKey: inputData.targetProjectKey,
        projectData: {
          tasks: inputData.enhancedTasks,
        },
      });

      if (!result.success && inputData.exportFallback) {
        // Fallback to markdown export
        const exportResult = await documentExportTool.execute({
          projectData: {
            name: `Enhanced Project - ${inputData.targetProjectKey}`,
            description: "Enhanced project structure",
            tasks: inputData.enhancedTasks.map(task => ({
              title: task.title,
              description: task.description,
              type: task.type,
              priority: "Medium",
              assignee: task.assignee,
              dueDate: task.dueDate,
              dependencies: task.blocks ? [task.blocks] : [],
              effort: "TBD",
              status: "To Do",
            })),
          },
          format: "detailed",
        });

        return {
          success: true,
          result: exportResult.data,
          fallbackExport: exportResult.data.markdown,
        };
      }

      return {
        success: result.success,
        result: result.data,
      };
    } catch (error) {
      throw new Error(`Failed to write enhanced project: ${error}`);
    }
  },
});

const jiraWorkflow = createWorkflow({
  id: "jira-enhancement-workflow",
  inputSchema: z.object({
    sourceProjectKey: z.string().optional().describe("Source project key to enhance (optional)"),
    targetProjectKey: z.string().describe("Target project key to write to (must be team-based)"),
    messyInput: z.string().optional().describe("Raw project description if no source project"),
    exportFallback: z.boolean().default(false).describe("Export to markdown if Jira write fails"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.any(),
    recommendations: z.string(),
    fallbackExport: z.string().optional(),
  }),
})
  .then(readAndEnhanceProject)
  .then(enhanceProject)
  .then(writeEnhancedProject);

jiraWorkflow.commit();

export { jiraWorkflow };