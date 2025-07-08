import { Agent } from "@mastra/core/agent";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { model } from "../../config";
import { trelloTool } from "./trello-tool";
import { documentExportTool } from "./document-export-tool";

const personalProjectAgent = new Agent({
  name: "Personal Project Enhancement Agent",
  model,
  instructions: `
    You are a proactive personal project management expert specializing in enhancing and structuring Trello boards.

    Your role is to:
    1. Analyze existing board structures and identify missing organization or clarity
    2. Enhance card descriptions with clear action items and context
    3. Create logical list flows (Backlog → In Progress → Review → Done)
    4. Add appropriate labels for categorization and priority
    5. Structure checklists for complex tasks
    6. Suggest realistic due dates and dependencies

    For new projects from messy input:
    - Extract clear project goals and break into phases
    - Structure into logical lists and workflow stages
    - Create actionable cards with clear outcomes
    - Add appropriate labels and organization
    - Suggest realistic timelines and milestones

    Guidelines:
    - Keep cards actionable and specific
    - Use lists to represent workflow stages or project phases
    - Add checklists for multi-step tasks
    - Use labels for priority, category, or status
    - Consider personal capacity and realistic timelines
    - Focus on personal productivity and clarity
    - Suggest automation opportunities where relevant

    Always structure for personal workflow optimization and clear progress tracking.
  `,
  tools: [trelloTool, documentExportTool],
});

const readAndEnhanceBoard = createStep({
  id: "read-and-enhance-board",
  description: "Reads source board (if provided) and enhances it, or creates from messy input",
  inputSchema: z.object({
    sourceWorkspaceName: z.string().optional().describe("Source workspace name"),
    sourceBoardName: z.string().optional().describe("Source board name to read from"),
    messyInput: z.string().optional().describe("Raw project description if no source board"),
  }),
  outputSchema: z.object({
    enhancedBoardData: z.object({
      lists: z.array(z.object({
        name: z.string(),
        cards: z.array(z.object({
          title: z.string(),
          description: z.string(),
          labels: z.array(z.string()),
          dueDate: z.string().optional(),
          checklist: z.array(z.string()),
        })),
      })),
      labels: z.array(z.object({
        name: z.string(),
        color: z.string(),
      })),
    }),
    recommendations: z.string(),
  }),
  execute: async (context) => {
    // Debug logging
    console.log("readAndEnhanceBoard context:", context);

    // Handle both destructured and non-destructured contexts
    const inputData = context?.inputData || context;

    if (!inputData) {
      throw new Error("Input data not found");
    }

    let prompt = "";
    let boardData = null;

    // Read source board if provided
    if (inputData.sourceWorkspaceName && inputData.sourceBoardName) {
      try {
        // Corrected: Removed the 'context' argument from trelloTool.execute
        const result = await trelloTool.execute({
          action: "read",
          workspaceName: inputData.sourceWorkspaceName,
          boardName: inputData.sourceBoardName,
        });

        if (!result.success) {
          throw new Error(`Failed to read board: ${result.error}`);
        }

        boardData = result.data;
        prompt = `Analyze this Trello board and enhance it:

          Board Data: ${JSON.stringify(boardData, null, 2)}

          Please:
          1. Identify missing organization or unclear cards
          2. Enhance card descriptions with clear action items
          3. Suggest better list structures and workflow
          4. Add appropriate labels and checklists
          5. Recommend improvements to board organization
          6. Suggest realistic due dates and priorities

          Return the enhanced board structure and your recommendations.`;
      } catch (error) {
        console.error("Error reading board:", error);
        // If board reading fails, fall back to treating as messy input
        prompt = `Transform this board enhancement request into a well-structured Trello board:

          Workspace: ${inputData.sourceWorkspaceName}
          Board: ${inputData.sourceBoardName}
          (Unable to read existing board, creating new structure)

          Please create a comprehensive board structure with appropriate lists, cards, and labels.`;
      }
    } else if (inputData.messyInput) {
      // Creating from messy input
      prompt = `Transform this messy project description into a well-structured Trello board:

        Input: ${inputData.messyInput}

        Please:
        1. Extract clear project goals and phases
        2. Structure into logical lists and workflow stages
        3. Create actionable cards with clear outcomes
        4. Add appropriate labels and organization
        5. Suggest realistic timelines and milestones
        6. Structure checklists for complex tasks

        Return the structured board and your recommendations.`;
    } else {
      throw new Error("Either source board details or messyInput must be provided");
    }

    const response = await personalProjectAgent.stream([
      {
        role: "user",
        content: prompt,
      },
    ]);

    let enhancementText = "";
    for await (const chunk of response.textStream) {
      enhancementText += chunk;
    }

    // For now, return a structured example - you'll want to parse the AI response
    const enhancedBoardData = {
      lists: [
        {
          name: "Backlog",
          cards: [
            {
              title: "Project Planning",
              description: "Define project scope, goals, and success criteria",
              labels: ["Priority: High", "Planning"],
              checklist: [
                "Define project objectives",
                "Identify key stakeholders",
                "Set success metrics",
                "Create project timeline",
              ],
            },
            {
              title: "Research & Analysis",
              description: "Gather requirements and conduct market research",
              labels: ["Priority: Medium", "Research"],
              checklist: [
                "Conduct user interviews",
                "Analyze competitors",
                "Document requirements",
              ],
            },
          ],
        },
        {
          name: "In Progress",
          cards: [],
        },
        {
          name: "Review",
          cards: [],
        },
        {
          name: "Done",
          cards: [],
        },
      ],
      labels: [
        { name: "Priority: High", color: "red" },
        { name: "Priority: Medium", color: "yellow" },
        { name: "Priority: Low", color: "green" },
        { name: "Planning", color: "blue" },
        { name: "Research", color: "purple" },
        { name: "Development", color: "orange" },
        { name: "Testing", color: "pink" },
      ],
    };

    return {
      enhancedBoardData,
      recommendations: enhancementText,
    };
  },
});

const enhanceBoard = createStep({
  id: "enhance-board",
  description: "Analyzes and enhances the board structure",
  inputSchema: z.object({
    enhancedBoardData: z.object({
      lists: z.array(z.object({
        name: z.string(),
        cards: z.array(z.object({
          title: z.string(),
          description: z.string(),
          labels: z.array(z.string()),
          dueDate: z.string().optional(),
          checklist: z.array(z.string()),
        })),
      })),
      labels: z.array(z.object({
        name: z.string(),
        color: z.string(),
      })),
    }),
    recommendations: z.string(),
  }),
  outputSchema: z.object({
    enhancedBoardData: z.object({
      lists: z.array(z.object({
        name: z.string(),
        cards: z.array(z.object({
          title: z.string(),
          description: z.string(),
          labels: z.array(z.string()),
          dueDate: z.string().optional(),
          checklist: z.array(z.string()),
        })),
      })),
      labels: z.array(z.object({
        name: z.string(),
        color: z.string(),
      })),
    }),
    recommendations: z.string(),
  }),
  execute: async (context) => {
    // Debug logging
    console.log("enhanceBoard context:", context);

    // Handle both destructured and non-destructured contexts
    const inputData = context?.inputData || context;

    if (!inputData) {
      throw new Error("Input data not found");
    }

    // Pass through the enhanced data - this step could be used for additional processing
    return {
      enhancedBoardData: inputData.enhancedBoardData,
      recommendations: inputData.recommendations,
    };
  },
});

const writeEnhancedBoard = createStep({
  id: "write-enhanced-board",
  description: "Writes the enhanced board to the target Trello board",
  inputSchema: z.object({
    targetWorkspaceName: z.string().describe("Target workspace name"),
    targetBoardName: z.string().describe("Target board name to write to"),
    enhancedBoardData: z.object({
      lists: z.array(z.object({
        name: z.string(),
        cards: z.array(z.object({
          title: z.string(),
          description: z.string(),
          labels: z.array(z.string()),
          dueDate: z.string().optional(),
          checklist: z.array(z.string()),
        })),
      })),
      labels: z.array(z.object({
        name: z.string(),
        color: z.string(),
      })),
    }),
    exportFallback: z.boolean().default(false),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.any(),
    fallbackExport: z.string().optional(),
  }),
  execute: async (context) => {
    // Debug logging
    console.log("writeEnhancedBoard context:", context);

    // Handle both destructured and non-destructured contexts
    const inputData = context?.inputData || context;

    if (!inputData) {
      throw new Error("Input data not found");
    }

    try {
      // Corrected: Removed the 'context' argument from trelloTool.execute
      const result = await trelloTool.execute({
        action: "write",
        workspaceName: inputData.targetWorkspaceName,
        boardName: inputData.targetBoardName,
        boardData: inputData.enhancedBoardData,
      });

      if (!result.success && inputData.exportFallback) {
        // Fallback to markdown export
        const tasks = inputData.enhancedBoardData.lists.flatMap((list) =>
          list.cards.map((card) => ({
            title: card.title,
            description: card.description,
            type: "Task",
            priority:
              card.labels.find((l) => l.includes("Priority"))?.split(": ")[1] ||
              "Medium",
            dueDate: card.dueDate,
            dependencies: [],
            effort: "TBD",
            status: list.name,
          }))
        );

        // Corrected: Removed the 'context' argument from documentExportTool.execute
        const exportResult = await documentExportTool.execute({
          projectData: {
            name: `Enhanced Board - ${inputData.targetBoardName}`,
            description: "Enhanced board structure",
            tasks,
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
      console.error("Error writing board:", error);

      // If writing fails, try the fallback export
      if (inputData.exportFallback) {
        try {
          const tasks = inputData.enhancedBoardData.lists.flatMap((list) =>
            list.cards.map((card) => ({
              title: card.title,
              description: card.description,
              type: "Task",
              priority:
                card.labels.find((l) => l.includes("Priority"))?.split(": ")[1] ||
                "Medium",
              dueDate: card.dueDate,
              dependencies: [],
              effort: "TBD",
              status: list.name,
            }))
          );

          // Corrected: Removed the 'context' argument from documentExportTool.execute
          const exportResult = await documentExportTool.execute({
            projectData: {
              name: `Enhanced Board - ${inputData.targetBoardName}`,
              description: "Enhanced board structure",
              tasks,
            },
            format: "detailed",
          });

          return {
            success: true,
            result: exportResult.data,
            fallbackExport: exportResult.data.markdown,
          };
        } catch (exportError) {
          console.error("Export fallback also failed:", exportError);
          throw new Error(`Failed to write enhanced board and export fallback failed: ${error}`);
        }
      }

      throw new Error(`Failed to write enhanced board: ${error}`);
    }
  },
});

const trelloWorkflow = createWorkflow({
  id: "trello-enhancement-workflow",
  inputSchema: z.object({
    sourceWorkspaceName: z.string().optional().describe("Source workspace name (optional)"),
    sourceBoardName: z.string().optional().describe("Source board name to enhance (optional)"),
    targetWorkspaceName: z.string().describe("Target workspace name"),
    targetBoardName: z.string().describe("Target board name to write to"),
    messyInput: z.string().optional().describe("Raw project description if no source board"),
    exportFallback: z.boolean().default(false).describe("Export to markdown if Trello write fails"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    result: z.any(),
    recommendations: z.string(),
    fallbackExport: z.string().optional(),
  }),
})
  .then(readAndEnhanceBoard)
  .then(enhanceBoard)
  .then(writeEnhancedBoard);

trelloWorkflow.commit();

export { trelloWorkflow };