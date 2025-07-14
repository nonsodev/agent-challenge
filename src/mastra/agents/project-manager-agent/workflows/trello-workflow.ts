// Trello Task Enhancement Workflow
import { Agent } from "@mastra/core/agent";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { model } from "../../../config";

const agent = new Agent({
  name: "Trello Task Enhancement Agent",
  model,
  instructions: `
    You are an expert project manager and task organizer. Your role is to transform messy, unstructured task descriptions into well-organized, actionable project boards.

    Given a project description or messy task list, you will:
    1. Analyze the content and identify the main project theme
    2. Break down complex tasks into manageable subtasks
    3. Create logical groupings and categories
    4. Generate comprehensive checklists for each task
    5. Suggest realistic time constraints and priorities
    6. Organize everything into a structured board format

    Structure your response as a JSON object with the following format:
    {
      "boardName": "Clear, descriptive board name",
      "lists": [
        {
          "name": "List Name (e.g., Planning, In Progress, Review, Done)",
          "cards": [
            {
              "title": "Clear, actionable task title",
              "description": "Detailed description of what needs to be done",
              "labels": ["Research", "Design", "Development", "Testing", "Review"],
              "dueInDays": 3,
              "priority": "High/Medium/Low",
              "checklist": [
                "Specific actionable step 1",
                "Specific actionable step 2",
                "Specific actionable step 3"
              ]
            }
          ]
        }
      ]
    }

    Guidelines:
    - Create 4-6 lists maximum (typical workflow: To Do, In Progress, Review, Done)
    - Each card should have 3-8 checklist items
    - Due dates should be realistic (1-30 days)
    - Use clear, action-oriented language
    - Group related tasks logically
    - Include dependencies and prerequisites
    - Add relevant labels (Research, Design, Development, Testing, Review, etc.)
    - Ensure all tasks are specific and measurable

    CRITICAL: You must respond with ONLY valid JSON. Do not include any markdown formatting, code blocks, or additional text. Start your response with { and end with }. No explanatory text before or after the JSON.
  `,
});

// Input schema for the workflow
const workflowInputSchema = z.object({
  taskDescription: z.string().describe("The messy tasks or project description to enhance"),
  sourceWorkspace: z.string().optional().describe("Existing workspace to read from (optional)"),
  sourceBoard: z.string().optional().describe("Existing board to read from (optional)"),
  targetWorkspace: z.string().describe("Target workspace to create the enhanced board in"),
  targetBoard: z.string().describe("Name for the new enhanced board"),
});

// Enhanced task structure schema
const enhancedTaskSchema = z.object({
  boardName: z.string(),
  lists: z.array(z.object({
    name: z.string(),
    cards: z.array(z.object({
      title: z.string(),
      description: z.string(),
      labels: z.array(z.string()),
      dueInDays: z.number(),
      priority: z.string(),
      checklist: z.array(z.string()),
    })),
  })),
});

// Trello API configuration
const TRELLO_BASE_URL = "https://api.trello.com/1";

// Helper function to get auth parameters
function getAuthParams() {
  const API_KEY = process.env.TRELLO_API_KEY;
  const TOKEN = process.env.TRELLO_TOKEN;
  if (!API_KEY || !TOKEN) {
    throw new Error("TRELLO_API_KEY and TRELLO_TOKEN must be set in environment variables");
  }
  return { key: API_KEY, token: TOKEN };
}

// Helper function to make authenticated requests
async function trelloRequest(endpoint: string, method: string = 'GET', params: any = {}) {
  const auth = getAuthParams();
  const url = new URL(`${TRELLO_BASE_URL}${endpoint}`);
  
  // Add auth and other params
  Object.entries({ ...auth, ...params }).forEach(([key, value]) => {
    if (value) url.searchParams.append(key, String(value));
  });

  const response = await fetch(url.toString(), { method });
  if (!response.ok) {
    throw new Error(`Trello API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// Step 1: Read existing board (if specified)
const readExistingBoard = createStep({
  id: "read-existing-board",
  description: "Reads existing Trello board data if source workspace and board are provided",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({
    existingBoardData: z.string().optional(),
    originalInput: workflowInputSchema,
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error("Input data not found");
    }

    let existingBoardData = "";

    if (inputData.sourceWorkspace && inputData.sourceBoard) {
      try {
        // Get workspace ID
        const organizations = await trelloRequest("/members/me/organizations");
        const workspace = organizations.find((org: any) => 
          org.displayName.toLowerCase() === inputData.sourceWorkspace!.toLowerCase()
        );
        
        if (!workspace) {
          throw new Error(`Workspace '${inputData.sourceWorkspace}' not found`);
        }

        // Get board
        const boards = await trelloRequest(`/organizations/${workspace.id}/boards`);
        const board = boards.find((b: any) => 
          b.name.toLowerCase() === inputData.sourceBoard!.toLowerCase()
        );

        if (!board) {
          throw new Error(`Board '${inputData.sourceBoard}' not found in workspace`);
        }

        // Get board structure
        const lists = await trelloRequest(`/boards/${board.id}/lists`);
        const labels = await trelloRequest(`/boards/${board.id}/labels`);
        const labelMap = Object.fromEntries(labels.map((l: any) => [l.id, l.name]));

        let boardStructure = `Board: ${board.name}\n\n`;

        for (const list of lists) {
          const cards = await trelloRequest(`/lists/${list.id}/cards`);
          boardStructure += `List: ${list.name}\n`;
          
          for (const card of cards) {
            boardStructure += `  - ${card.name}\n`;
            if (card.desc) boardStructure += `    Description: ${card.desc}\n`;
            if (card.idLabels.length > 0) {
              const cardLabels = card.idLabels.map((id: string) => labelMap[id]).join(", ");
              boardStructure += `    Labels: ${cardLabels}\n`;
            }
            if (card.due) boardStructure += `    Due: ${card.due}\n`;

            // Get checklists
            const checklists = await trelloRequest(`/cards/${card.id}/checklists`);
            for (const checklist of checklists) {
              boardStructure += `    Checklist: ${checklist.name}\n`;
              for (const item of checklist.checkItems) {
                const status = item.state === 'complete' ? '✓' : '○';
                boardStructure += `      ${status} ${item.name}\n`;
              }
            }
          }
          boardStructure += "\n";
        }

        existingBoardData = boardStructure;
      } catch (error) {
        console.warn(`Could not read existing board: ${error}`);
        existingBoardData = "";
      }
    }

    return {
      existingBoardData,
      originalInput: inputData,
    };
  },
});

// Step 2: Enhance tasks using AI
const enhanceTasks = createStep({
  id: "enhance-tasks",
  description: "Uses AI to enhance and structure the task description",
  inputSchema: z.object({
    existingBoardData: z.string().optional(),
    originalInput: workflowInputSchema,
  }),
  outputSchema: z.object({
    enhancedTasks: enhancedTaskSchema,
    originalInput: workflowInputSchema,
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error("Input data not found");
    }

    let prompt = `Transform the following project description into a well-structured Trello board:

Project Description:
${inputData.originalInput.taskDescription}

Target Board Name: ${inputData.originalInput.targetBoard}`;

    if (inputData.existingBoardData) {
      prompt += `\n\nExisting Board Data to Consider:
${inputData.existingBoardData}`;
    }

    const response = await agent.stream([
      {
        role: "user",
        content: prompt,
      },
    ]);

    let enhancedTasksText = "";
    for await (const chunk of response.textStream) {
      enhancedTasksText += chunk;
    }

    let enhancedTasks;
    try {
      // Clean the response - remove markdown code blocks and trim whitespace
      let cleanedResponse = enhancedTasksText.trim();
      
      // Remove markdown code blocks if present
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Trim again after cleaning
      cleanedResponse = cleanedResponse.trim();
      
      enhancedTasks = JSON.parse(cleanedResponse);
      
      // Validate the structure
      if (!enhancedTasks.boardName || !enhancedTasks.lists || !Array.isArray(enhancedTasks.lists)) {
        throw new Error("Invalid enhanced tasks structure");
      }
    } catch (error) {
      throw new Error(`Failed to parse AI response as JSON: ${error}. Response was: ${enhancedTasksText.substring(0, 200)}...`);
    }

    return {
      enhancedTasks,
      originalInput: inputData.originalInput,
    };
  },
});

// Step 3: Create Trello board
const createTrelloBoard = createStep({
  id: "create-trello-board",
  description: "Creates the enhanced Trello board with tasks, lists, and cards",
  inputSchema: z.object({
    enhancedTasks: enhancedTaskSchema,
    originalInput: workflowInputSchema,
  }),
  outputSchema: z.object({
    boardUrl: z.string(),
    summary: z.string(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error("Input data not found");
    }

    const { enhancedTasks, originalInput } = inputData;

    // Get member ID
    const member = await trelloRequest("/members/me");
    const memberId = member.id;

    // Get or create workspace
    let workspaceId;
    const organizations = await trelloRequest("/members/me/organizations");
    const existingWorkspace = organizations.find((org: any) => 
      org.displayName.toLowerCase() === originalInput.targetWorkspace.toLowerCase()
    );

    if (existingWorkspace) {
      workspaceId = existingWorkspace.id;
    } else {
      const newWorkspace = await trelloRequest("/organizations", "POST", {
        displayName: originalInput.targetWorkspace,
        name: originalInput.targetWorkspace.toLowerCase().replace(/\s+/g, "-"),
      });
      workspaceId = newWorkspace.id;
    }

    // Create board
    const board = await trelloRequest("/boards", "POST", {
      name: enhancedTasks.boardName || originalInput.targetBoard,
      idOrganization: workspaceId,
      defaultLists: false,
    });

    // Archive any default lists
    const defaultLists = await trelloRequest(`/boards/${board.id}/lists`);
    for (const list of defaultLists) {
      await trelloRequest(`/lists/${list.id}/closed`, "PUT", { value: true });
    }

    // Create labels
    const labelColors = ["blue", "green", "orange", "red", "purple", "yellow", "pink", "sky"];
    const labelMap = new Map<string, string>();
    const uniqueLabels = [...new Set(enhancedTasks.lists.flatMap(list => 
      list.cards.flatMap(card => card.labels)
    ))];

    for (let i = 0; i < uniqueLabels.length; i++) {
      const label = await trelloRequest("/labels", "POST", {
        idBoard: board.id,
        name: uniqueLabels[i],
        color: labelColors[i % labelColors.length],
      });
      labelMap.set(uniqueLabels[i], label.id);
    }

    // Create lists and cards
    let totalCards = 0;
    for (const listData of enhancedTasks.lists) {
      const list = await trelloRequest("/lists", "POST", {
        idBoard: board.id,
        name: listData.name,
      });

      for (const cardData of listData.cards) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + cardData.dueInDays);

        const card = await trelloRequest("/cards", "POST", {
          idList: list.id,
          name: cardData.title,
          desc: `${cardData.description}\n\n**Priority:** ${cardData.priority}`,
          due: dueDate.toISOString(),
          idLabels: cardData.labels.map(label => labelMap.get(label)).filter(Boolean).join(","),
          idMembers: memberId,
        });

        // Add checklist
        if (cardData.checklist.length > 0) {
          const checklist = await trelloRequest(`/cards/${card.id}/checklists`, "POST", {
            name: "Tasks",
          });

          for (const item of cardData.checklist) {
            await trelloRequest(`/checklists/${checklist.id}/checkItems`, "POST", {
              name: item,
            });
          }
        }

        totalCards++;
      }
    }

    const summary = `Successfully created board "${enhancedTasks.boardName}" with ${enhancedTasks.lists.length} lists and ${totalCards} cards in workspace "${originalInput.targetWorkspace}".`;

    return {
      boardUrl: board.url,
      summary,
    };
  },
});

// Main workflow
const trelloWorkflow = createWorkflow({
  id: "trello-enhancement-workflow",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({
    boardUrl: z.string(),
    summary: z.string(),
  }),
})
  .then(readExistingBoard)
  .then(enhanceTasks)
  .then(createTrelloBoard);

trelloWorkflow.commit();

export { trelloWorkflow };