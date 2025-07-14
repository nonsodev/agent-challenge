import { createTool } from "@mastra/core/tools";
import { z } from "zod";

interface TrelloConfig {
  apiKey: string;
  token: string;
}

interface TrelloCard {
  name: string;
  description: string;
  due?: string;
  labels: string[];
  members: string[];
  checklists: Array<{
    name: string;
    items: Array<{
      name: string;
      completed: boolean;
    }>;
  }>;
}

interface TrelloList {
  name: string;
  cards: TrelloCard[];
}

interface TrelloBoard {
  name: string;
  url: string;
  lists: TrelloList[];
}

// Helper function to handle API rate limiting with exponential backoff
async function makeApiCall(url: string, options: any = {}, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        // Rate limited - wait before retry
        const waitTime = Math.pow(2, i) * 1000; // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error (${response.status}): ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      
      // Network error - wait before retry
      const waitTime = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// Helper function to validate and sanitize input
function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid input: must be a non-empty string');
  }
  return input.trim();
}

// Helper function to validate date format
function validateDate(dateString: string): boolean {
  if (!dateString) return false;
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && date > new Date('1970-01-01');
}

export const trelloTool = createTool({
  id: "trello-manager",
  description: "Read from or write to Trello boards with comprehensive error handling",
  inputSchema: z.object({
    action: z.enum(["read", "write"]).describe("Action to perform"),
    workspaceName: z.string().min(1).max(100).describe("Trello workspace name"),
    boardName: z.string().min(1).max(100).describe("Board name"),
    boardData: z.object({
      lists: z.array(z.object({
        name: z.string().min(1).max(100),
        cards: z.array(z.object({
          title: z.string().min(1).max(16384), // Trello card title limit
          description: z.string().max(16384).default(""), // Trello description limit
          labels: z.array(z.string().max(100)).default([]),
          dueDate: z.string().optional().refine(val => !val || validateDate(val), {
            message: "Invalid date format"
          }),
          checklist: z.array(z.string().max(16384)).default([]),
        })),
      })),
      labels: z.array(z.object({
        name: z.string().min(1).max(100),
        color: z.enum(["yellow", "purple", "blue", "red", "green", "orange", "black", "sky", "pink", "lime"]).default("blue"),
      })).default([]),
    }).optional().describe("Board data for writing"),
    options: z.object({
      maxRetries: z.number().min(1).max(10).default(3),
      timeoutMs: z.number().min(1000).max(60000).default(30000),
      archiveExistingLists: z.boolean().default(true),
      createWorkspaceIfNotExists: z.boolean().default(false),
    }).optional().describe("Additional options"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    data: z.union([
      z.object({
        board: z.object({
          name: z.string(),
          url: z.string(),
          lists: z.array(z.object({
            name: z.string(),
            cards: z.array(z.object({
              name: z.string(),
              description: z.string(),
              due: z.string().optional(),
              labels: z.array(z.string()),
              members: z.array(z.string()),
              checklists: z.array(z.object({
                name: z.string(),
                items: z.array(z.object({
                  name: z.string(),
                  completed: z.boolean(),
                })),
              })),
            })),
          })),
        }),
      }),
      z.object({
        boardUrl: z.string(),
        listsCreated: z.number(),
        cardsCreated: z.number(),
        labelsCreated: z.number(),
        warnings: z.array(z.string()).optional(),
      }),
      z.string(),
    ]),
    error: z.string().optional(),
    warnings: z.array(z.string()).optional(),
  }),
  execute: async ({ context }) => {
    const { action, workspaceName, boardName, boardData, options = {} } = context;
    const warnings: string[] = [];

    try {
      // Validate and sanitize inputs
      const sanitizedWorkspaceName = sanitizeInput(workspaceName);
      const sanitizedBoardName = sanitizeInput(boardName);

      // Read Trello configuration from environment variables
      const config: TrelloConfig = {
        apiKey: process.env.TRELLO_API_KEY?.trim() || '',
        token: process.env.TRELLO_TOKEN?.trim() || '',
      };

      if (!config.apiKey || !config.token) {
        return {
          success: false,
          data: "Trello API credentials are not configured in environment variables. Please set TRELLO_API_KEY and TRELLO_TOKEN.",
          error: "Missing Trello API configuration"
        };
      }

      // Validate API credentials format
      if (config.apiKey.length < 20 || config.token.length < 20) {
        return {
          success: false,
          data: "Trello API credentials appear to be invalid. Please check TRELLO_API_KEY and TRELLO_TOKEN format.",
          error: "Invalid API credentials format"
        };
      }

      if (action === "read") {
        return await readTrelloBoard(config, sanitizedWorkspaceName, sanitizedBoardName, options);
      } else {
        if (!boardData) {
          return {
            success: false,
            data: "Board data is required for writing action",
            error: "Missing board data"
          };
        }

        // Validate board data
        if (!boardData.lists || boardData.lists.length === 0) {
          return {
            success: false,
            data: "Board data must contain at least one list",
            error: "Empty board data"
          };
        }

        // Check for duplicate list names
        const listNames = boardData.lists.map(l => l.name.toLowerCase());
        const duplicateListNames = listNames.filter((name, index) => listNames.indexOf(name) !== index);
        if (duplicateListNames.length > 0) {
          warnings.push(`Duplicate list names found: ${duplicateListNames.join(', ')}`);
        }

        // Check for duplicate label names
        if (boardData.labels) {
          const labelNames = boardData.labels.map(l => l.name.toLowerCase());
          const duplicateLabelNames = labelNames.filter((name, index) => labelNames.indexOf(name) !== index);
          if (duplicateLabelNames.length > 0) {
            warnings.push(`Duplicate label names found: ${duplicateLabelNames.join(', ')}`);
          }
        }

        const result = await writeTrelloBoard(config, sanitizedWorkspaceName, sanitizedBoardName, boardData, options);
        
        if (result.success && warnings.length > 0) {
          (result.data as any).warnings = warnings;
        }
        
        return result;
      }
    } catch (error: any) {
      return {
        success: false,
        data: `Unexpected error: ${error.message}`,
        error: error.message,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }
  },
});

async function readTrelloBoard(config: TrelloConfig, workspaceName: string, boardName: string, options: any = {}) {
  try {
    const baseUrl = "https://api.trello.com/1";
    const auth = { key: config.apiKey, token: config.token };
    const maxRetries = options.maxRetries || 3;
    
    // Test API connectivity first
    try {
      await makeApiCall(`${baseUrl}/members/me?${new URLSearchParams(auth)}`, {}, 1);
    } catch (error) {
      throw new Error(`Failed to connect to Trello API. Please check your credentials and internet connection: ${error.message}`);
    }

    // Get workspace ID with better error handling
    const workspaces = await makeApiCall(`${baseUrl}/members/me/organizations?${new URLSearchParams(auth)}`, {}, maxRetries);
    
    if (!Array.isArray(workspaces) || workspaces.length === 0) {
      throw new Error("No workspaces found. Please ensure you have access to at least one Trello workspace.");
    }

    const workspace = workspaces.find((w: any) => 
      w.displayName?.toLowerCase() === workspaceName.toLowerCase() ||
      w.name?.toLowerCase() === workspaceName.toLowerCase()
    );
    
    if (!workspace) {
      const availableWorkspaces = workspaces.map((w: any) => w.displayName || w.name).join(', ');
      throw new Error(`Workspace "${workspaceName}" not found. Available workspaces: ${availableWorkspaces}`);
    }

    // Get board with better error handling
    const boards = await makeApiCall(`${baseUrl}/organizations/${workspace.id}/boards?${new URLSearchParams(auth)}`, {}, maxRetries);
    
    if (!Array.isArray(boards)) {
      throw new Error("Failed to retrieve boards from workspace");
    }

    const board = boards.find((b: any) => b.name?.toLowerCase() === boardName.toLowerCase());
    
    if (!board) {
      const availableBoards = boards.map((b: any) => b.name).filter(Boolean).join(', ');
      throw new Error(`Board "${boardName}" not found in workspace "${workspaceName}". Available boards: ${availableBoards || 'None'}`);
    }

    // Check if board is accessible
    if (board.closed) {
      throw new Error(`Board "${boardName}" is closed/archived`);
    }

    // Get lists with error handling
    const lists = await makeApiCall(`${baseUrl}/boards/${board.id}/lists?${new URLSearchParams(auth)}`, {}, maxRetries);
    
    if (!Array.isArray(lists)) {
      throw new Error("Failed to retrieve lists from board");
    }

    // Get labels and members with error handling
    const [labels, members] = await Promise.all([
      makeApiCall(`${baseUrl}/boards/${board.id}/labels?${new URLSearchParams(auth)}`, {}, maxRetries),
      makeApiCall(`${baseUrl}/boards/${board.id}/members?${new URLSearchParams(auth)}`, {}, maxRetries)
    ]);

    const labelMap = Object.fromEntries(
      (Array.isArray(labels) ? labels : []).map((l: any) => [l.id, l.name || 'Unnamed Label'])
    );

    const memberMap = Object.fromEntries(
      (Array.isArray(members) ? members : []).map((m: any) => [m.id, m.username || m.fullName || 'Unknown Member'])
    );

    // Build board data
    const boardData: TrelloBoard = {
      name: board.name,
      url: board.url,
      lists: [],
    };

    // Process lists and cards
    for (const list of lists) {
      if (!list.id) continue; // Skip invalid lists

      try {
        const cards = await makeApiCall(`${baseUrl}/lists/${list.id}/cards?${new URLSearchParams(auth)}`, {}, maxRetries);
        
        const listData: TrelloList = {
          name: list.name || 'Unnamed List',
          cards: [],
        };

        if (Array.isArray(cards)) {
          for (const card of cards) {
            if (!card.id) continue; // Skip invalid cards

            try {
              // Get checklists with error handling
              const checklists = await makeApiCall(`${baseUrl}/cards/${card.id}/checklists?${new URLSearchParams(auth)}`, {}, maxRetries);
              
              const cardData: TrelloCard = {
                name: card.name || 'Unnamed Card',
                description: card.desc || "",
                due: card.due ? new Date(card.due).toISOString().split('T')[0] : undefined,
                labels: (Array.isArray(card.idLabels) ? card.idLabels : [])
                  .map((id: string) => labelMap[id])
                  .filter(Boolean),
                members: (Array.isArray(card.idMembers) ? card.idMembers : [])
                  .map((id: string) => memberMap[id])
                  .filter(Boolean),
                checklists: (Array.isArray(checklists) ? checklists : []).map((cl: any) => ({
                  name: cl.name || 'Unnamed Checklist',
                  items: (Array.isArray(cl.checkItems) ? cl.checkItems : []).map((item: any) => ({
                    name: item.name || 'Unnamed Item',
                    completed: item.state === "complete",
                  })),
                })),
              };
              
              listData.cards.push(cardData);
            } catch (cardError) {
              console.warn(`Failed to process card ${card.id}: ${cardError.message}`);
            }
          }
        }
        
        boardData.lists.push(listData);
      } catch (listError) {
        console.warn(`Failed to process list ${list.id}: ${listError.message}`);
      }
    }

    return {
      success: true,
      data: { board: boardData },
    };
  } catch (error: any) {
    return {
      success: false,
      data: `Failed to read Trello board: ${error.message}`,
      error: error.message,
    };
  }
}

async function writeTrelloBoard(config: TrelloConfig, workspaceName: string, boardName: string, boardData: any, options: any = {}) {
  try {
    const baseUrl = "https://api.trello.com/1";
    const auth = { key: config.apiKey, token: config.token };
    const maxRetries = options.maxRetries || 3;
    const archiveExistingLists = options.archiveExistingLists ?? true;
    const createWorkspaceIfNotExists = options.createWorkspaceIfNotExists ?? false;
    
    // Test API connectivity first
    try {
      await makeApiCall(`${baseUrl}/members/me?${new URLSearchParams(auth)}`, {}, 1);
    } catch (error) {
      throw new Error(`Failed to connect to Trello API: ${error.message}`);
    }

    // Get or create workspace
    const workspaces = await makeApiCall(`${baseUrl}/members/me/organizations?${new URLSearchParams(auth)}`, {}, maxRetries);
    let workspace = workspaces.find((w: any) => 
      w.displayName?.toLowerCase() === workspaceName.toLowerCase() ||
      w.name?.toLowerCase() === workspaceName.toLowerCase()
    );
    
    if (!workspace) {
      if (!createWorkspaceIfNotExists) {
        const availableWorkspaces = workspaces.map((w: any) => w.displayName || w.name).join(', ');
        throw new Error(`Workspace "${workspaceName}" not found. Available workspaces: ${availableWorkspaces}. Set createWorkspaceIfNotExists option to true to create it.`);
      }

      // Create workspace
      try {
        workspace = await makeApiCall(`${baseUrl}/organizations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...auth,
            displayName: workspaceName,
            name: workspaceName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 100),
          }),
        }, maxRetries);
      } catch (error) {
        throw new Error(`Failed to create workspace "${workspaceName}": ${error.message}`);
      }
    }

    // Get or create board
    const boards = await makeApiCall(`${baseUrl}/organizations/${workspace.id}/boards?${new URLSearchParams(auth)}`, {}, maxRetries);
    let board = boards.find((b: any) => b.name?.toLowerCase() === boardName.toLowerCase());

    if (!board) {
      try {
        board = await makeApiCall(`${baseUrl}/boards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...auth,
            name: boardName,
            idOrganization: workspace.id,
            defaultLists: false,
          }),
        }, maxRetries);
      } catch (error) {
        throw new Error(`Failed to create board "${boardName}": ${error.message}`);
      }
    }

    // Archive existing lists if requested
    if (archiveExistingLists) {
      try {
        const existingLists = await makeApiCall(`${baseUrl}/boards/${board.id}/lists?${new URLSearchParams(auth)}`, {}, maxRetries);
        
        for (const list of existingLists) {
          if (list.id) {
            try {
              await makeApiCall(`${baseUrl}/lists/${list.id}/closed`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...auth, value: true }),
              }, maxRetries);
            } catch (error) {
              console.warn(`Failed to archive list ${list.id}: ${error.message}`);
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to archive existing lists: ${error.message}`);
      }
    }

    // Create labels
    const labelMap = new Map();
    let labelsCreated = 0;

    if (boardData.labels && Array.isArray(boardData.labels)) {
      for (const label of boardData.labels) {
        if (!label.name) continue;

        try {
          const createdLabel = await makeApiCall(`${baseUrl}/labels`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...auth,
              idBoard: board.id,
              name: label.name,
              color: label.color || 'blue',
            }),
          }, maxRetries);
          
          labelMap.set(label.name, createdLabel.id);
          labelsCreated++;
        } catch (error) {
          console.warn(`Failed to create label "${label.name}": ${error.message}`);
        }
      }
    }

    // Get current member ID
    const member = await makeApiCall(`${baseUrl}/members/me?${new URLSearchParams(auth)}`, {}, maxRetries);
    if (!member.id) {
      throw new Error("Failed to get current member information");
    }

    let totalCards = 0;
    let listsCreated = 0;

    // Create lists and cards
    for (const listData of boardData.lists) {
      if (!listData.name) continue;

      try {
        const list = await makeApiCall(`${baseUrl}/lists`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...auth,
            idBoard: board.id,
            name: listData.name,
          }),
        }, maxRetries);

        listsCreated++;

        // Create cards
        if (Array.isArray(listData.cards)) {
          for (const cardData of listData.cards) {
            if (!cardData.title) continue;

            try {
              const cardPayload: any = {
                ...auth,
                idList: list.id,
                name: cardData.title,
                desc: cardData.description || "",
                idMembers: [member.id],
              };

              // Add due date if valid
              if (cardData.dueDate && validateDate(cardData.dueDate)) {
                cardPayload.due = new Date(cardData.dueDate).toISOString();
              }

              // Add labels if they exist
              if (Array.isArray(cardData.labels) && cardData.labels.length > 0) {
                const labelIds = cardData.labels
                  .map(label => labelMap.get(label))
                  .filter(id => id);
                if (labelIds.length > 0) {
                  cardPayload.idLabels = labelIds.join(',');
                }
              }

              const card = await makeApiCall(`${baseUrl}/cards`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cardPayload),
              }, maxRetries);

              totalCards++;

              // Add checklist if provided
              if (Array.isArray(cardData.checklist) && cardData.checklist.length > 0) {
                try {
                  const checklist = await makeApiCall(`${baseUrl}/cards/${card.id}/checklists`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      ...auth,
                      name: "Checklist",
                    }),
                  }, maxRetries);

                  // Add checklist items
                  for (const item of cardData.checklist) {
                    if (!item) continue;

                    try {
                      await makeApiCall(`${baseUrl}/checklists/${checklist.id}/checkItems`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          ...auth,
                          name: item,
                        }),
                      }, maxRetries);
                    } catch (error) {
                      console.warn(`Failed to create checklist item "${item}": ${error.message}`);
                    }
                  }
                } catch (error) {
                  console.warn(`Failed to create checklist for card "${cardData.title}": ${error.message}`);
                }
              }
            } catch (error) {
              console.warn(`Failed to create card "${cardData.title}": ${error.message}`);
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to create list "${listData.name}": ${error.message}`);
      }
    }

    return {
      success: true,
      data: {
        boardUrl: board.url,
        listsCreated,
        cardsCreated: totalCards,
        labelsCreated,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      data: `Failed to create Trello board: ${error.message}`,
      error: error.message,
    };
  }
}