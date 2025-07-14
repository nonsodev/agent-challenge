import { createTool } from "@mastra/core/tools";
import { z } from "zod";

interface JiraConfig {
  email: string;
  apiToken: string;
  baseUrl: string;
}

interface JiraIssue {
  key: string;
  summary: string;
  type: string;
  status: string;
  created?: string;
  duedate?: string;
  assignee?: string;
  epic?: string;
  sprint?: string;
}

interface JiraProject {
  key: string;
  name: string;
  sprints: Array<{
    name: string;
    issues: JiraIssue[];
  }>;
  backlog: JiraIssue[];
}

export const jiraTool = createTool({
  id: "jira-manager",
  description: "Read from or write to Jira projects",
  inputSchema: z.object({
    action: z.enum(["read", "write"]).describe("Action to perform"),
    projectKey: z.string().min(1, "Project key cannot be empty").describe("Existing project key"),
    projectData: z.object({
      tasks: z.array(z.object({
        title: z.string().min(1, "Task title cannot be empty").max(255, "Task title too long"),
        description: z.string().max(32767, "Description too long"),
        type: z.enum(["Story", "Task", "Bug", "Epic"]).default("Task"),
        assignee: z.string().email("Invalid email format").optional(),
        epic: z.string().optional(),
        sprint: z.string().optional(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format").optional(),
        blocks: z.string().optional(),
      })).min(1, "At least one task is required"),
    }).optional().describe("Tasks to create in the existing project"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    data: z.union([
      z.object({
        project: z.object({
          key: z.string(),
          name: z.string(),
          sprints: z.array(z.object({
            name: z.string(),
            issues: z.array(z.object({
              key: z.string(),
              summary: z.string(),
              type: z.string(),
              status: z.string(),
              created: z.string().optional(),
              duedate: z.string().optional(),
              assignee: z.string().optional(),
              epic: z.string().optional(),
              sprint: z.string().optional(),
            })),
          })),
          backlog: z.array(z.object({
            key: z.string(),
            summary: z.string(),
            type: z.string(),
            status: z.string(),
            created: z.string().optional(),
            duedate: z.string().optional(),
            assignee: z.string().optional(),
            epic: z.string().optional(),
          })),
        }),
      }),
      z.object({
        projectKey: z.string(),
        createdIssues: z.array(z.string()),
        boardUrl: z.string(),
        warnings: z.array(z.string()).optional(),
      }),
      z.string(),
    ]),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { action, projectKey, projectData } = context;

    // Enhanced configuration validation
    const config: JiraConfig = {
      email: process.env.JIRA_EMAIL?.trim() || '',
      apiToken: process.env.JIRA_API_TOKEN?.trim() || '',
      baseUrl: process.env.JIRA_BASE_URL?.trim()?.replace(/\/$/, '') || '', // Remove trailing slash
    };

    // Validate configuration
    const configErrors = validateConfig(config);
    if (configErrors.length > 0) {
      return {
        success: false,
        data: `Configuration errors: ${configErrors.join(', ')}`,
        error: "Invalid Jira configuration"
      };
    }

    // Validate project key format
    if (!isValidProjectKey(projectKey)) {
      return {
        success: false,
        data: "Invalid project key format. Project keys should contain only uppercase letters, numbers, and underscores.",
        error: "Invalid project key format"
      };
    }

    // Validate action-specific requirements
    if (action === "write") {
      if (!projectData || !projectData.tasks || projectData.tasks.length === 0) {
        return {
          success: false,
          data: "Project data with at least one task is required for write operations",
          error: "Missing project data"
        };
      }

      // Validate task data
      const taskValidationErrors = validateTasks(projectData.tasks);
      if (taskValidationErrors.length > 0) {
        return {
          success: false,
          data: `Task validation errors: ${taskValidationErrors.join(', ')}`,
          error: "Invalid task data"
        };
      }
    }

    try {
      if (action === "read") {
        return await readJiraProject(config, projectKey);
      } else {
        return await writeJiraIssues(config, projectKey, projectData!);
      }
    } catch (error: any) {
      return {
        success: false,
        data: `Unexpected error: ${error.message}`,
        error: error.message
      };
    }
  },
});

function validateConfig(config: JiraConfig): string[] {
  const errors: string[] = [];
  
  if (!config.email) {
    errors.push("JIRA_EMAIL environment variable is required");
  } else if (!config.email.includes('@')) {
    errors.push("JIRA_EMAIL must be a valid email address");
  }
  
  if (!config.apiToken) {
    errors.push("JIRA_API_TOKEN environment variable is required");
  } else if (config.apiToken.length < 10) {
    errors.push("JIRA_API_TOKEN appears to be too short");
  }
  
  if (!config.baseUrl) {
    errors.push("JIRA_BASE_URL environment variable is required");
  } else if (!config.baseUrl.startsWith('https://')) {
    errors.push("JIRA_BASE_URL must start with https://");
  }
  
  return errors;
}

function isValidProjectKey(projectKey: string): boolean {
  // Project keys should be 1-10 characters, uppercase letters, numbers, and underscores
  return /^[A-Z0-9_]{1,10}$/.test(projectKey);
}

function validateTasks(tasks: any[]): string[] {
  const errors: string[] = [];
  const taskTitles = new Set<string>();
  const epics = new Set<string>();
  
  tasks.forEach((task, index) => {
    const taskPrefix = `Task ${index + 1}`;
    
    // Check for duplicate titles
    if (taskTitles.has(task.title)) {
      errors.push(`${taskPrefix}: Duplicate task title "${task.title}"`);
    }
    taskTitles.add(task.title);
    
    // Validate due dates
    if (task.dueDate) {
      const dueDate = new Date(task.dueDate);
      if (isNaN(dueDate.getTime())) {
        errors.push(`${taskPrefix}: Invalid due date format "${task.dueDate}"`);
      } else if (dueDate < new Date()) {
        errors.push(`${taskPrefix}: Due date "${task.dueDate}" is in the past`);
      }
    }
    
    // Collect epics for validation
    if (task.type === "Epic") {
      epics.add(task.title);
    }
  });
  
  // Validate epic references
  tasks.forEach((task, index) => {
    if (task.epic && !epics.has(task.epic) && !task.epic.includes('-')) {
      errors.push(`Task ${index + 1}: Referenced epic "${task.epic}" not found in task list`);
    }
  });
  
  return errors;
}

async function makeJiraRequest(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });
      
      if (response.status === 429) {
        // Rate limited, wait and retry
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
        console.warn(`Rate limited, waiting ${delay}ms before retry ${attempt}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      return response;
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`Request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Request failed after retries');
}

async function readJiraProject(config: JiraConfig, projectKey: string) {
  try {
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
    };

    // Get project info with error handling
    const projectRes = await makeJiraRequest(`${config.baseUrl}/rest/api/3/project/${projectKey}`, {
      headers,
    });

    if (projectRes.status === 404) {
      return {
        success: false,
        data: `Project "${projectKey}" not found or you don't have permission to access it`,
        error: "Project not found"
      };
    }

    if (projectRes.status === 403) {
      return {
        success: false,
        data: `Access denied to project "${projectKey}". Check your permissions.`,
        error: "Access denied"
      };
    }

    if (!projectRes.ok) {
      const errorText = await projectRes.text();
      throw new Error(`Failed to fetch project: ${projectRes.status} ${errorText}`);
    }

    const project = await projectRes.json();

    // Get board ID with fallback
    let board = null;
    try {
      const boardRes = await makeJiraRequest(`${config.baseUrl}/rest/agile/1.0/board`, {
        headers,
      });

      if (boardRes.ok) {
        const boards = await boardRes.json();
        board = boards.values?.find((b: any) => b.location?.projectKey === projectKey);
      }
    } catch (error) {
      console.warn(`Could not fetch boards: ${error}`);
    }

    let sprints: any[] = [];
    if (board) {
      try {
        const sprintRes = await makeJiraRequest(`${config.baseUrl}/rest/agile/1.0/board/${board.id}/sprint`, {
          headers,
        });
        
        if (sprintRes.ok) {
          const sprintData = await sprintRes.json();
          sprints = sprintData.values || [];
        }
      } catch (error) {
        console.warn(`Could not fetch sprints: ${error}`);
      }
    }

    // Get issues with pagination
    const allIssues: any[] = [];
    let startAt = 0;
    const maxResults = 100;
    
    while (true) {
      const issueRes = await makeJiraRequest(
        `${config.baseUrl}/rest/api/3/search?jql=project=${projectKey}&startAt=${startAt}&maxResults=${maxResults}&fields=summary,issuetype,status,created,duedate,assignee,customfield_10020,parent`,
        { headers }
      );

      if (!issueRes.ok) {
        const errorText = await issueRes.text();
        throw new Error(`Failed to fetch issues: ${issueRes.status} ${errorText}`);
      }

      const issueData = await issueRes.json();
      allIssues.push(...(issueData.issues || []));
      
      if (issueData.total <= startAt + maxResults) {
        break;
      }
      startAt += maxResults;
    }

    // Organize by sprints with error handling
    const sprintMap = new Map();
    const backlogIssues: JiraIssue[] = [];

    for (const issue of allIssues) {
      try {
        const jiraIssue: JiraIssue = {
          key: issue.key || 'UNKNOWN',
          summary: issue.fields?.summary || 'No summary',
          type: issue.fields?.issuetype?.name || 'Unknown',
          status: issue.fields?.status?.name || 'Unknown',
          created: issue.fields?.created?.substring(0, 10),
          duedate: issue.fields?.duedate,
          assignee: issue.fields?.assignee?.displayName,
          epic: issue.fields?.parent?.key,
        };

        const issueSprints = issue.fields?.customfield_10020 || [];

        if (Array.isArray(issueSprints) && issueSprints.length > 0) {
          for (const sprint of issueSprints) {
            if (sprint && sprint.id && sprint.name) {
              if (!sprintMap.has(sprint.id)) {
                sprintMap.set(sprint.id, {
                  name: sprint.name,
                  issues: [],
                });
              }
              sprintMap.get(sprint.id).issues.push({
                ...jiraIssue,
                sprint: sprint.name,
              });
            }
          }
        } else {
          backlogIssues.push(jiraIssue);
        }
      } catch (error) {
        console.warn(`Error processing issue ${issue.key}: ${error}`);
        // Continue processing other issues
      }
    }

    return {
      success: true,
      data: {
        project: {
          key: project.key,
          name: project.name,
          sprints: Array.from(sprintMap.values()),
          backlog: backlogIssues,
        },
      },
    };
  } catch (error: any) {
    return {
      success: false,
      data: `Failed to read Jira project: ${error.message}`,
      error: error.message,
    };
  }
}

async function writeJiraIssues(config: JiraConfig, projectKey: string, projectData: any) {
  const warnings: string[] = [];
  
  try {
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    // Enhanced project validation
    const projectRes = await makeJiraRequest(`${config.baseUrl}/rest/api/3/project/${projectKey}`, {
      headers,
    });

    if (projectRes.status === 404) {
      return {
        success: false,
        data: `Project "${projectKey}" not found or you don't have permission to access it`,
        error: "Project not found"
      };
    }

    if (projectRes.status === 403) {
      return {
        success: false,
        data: `Access denied to project "${projectKey}". Check your permissions.`,
        error: "Access denied"
      };
    }

    if (!projectRes.ok) {
      const errorText = await projectRes.text();
      throw new Error(`Failed to fetch project: ${projectRes.status} ${errorText}`);
    }

    const project = await projectRes.json();
    const isTeamManaged = project.style === "next-gen";

    // Get board ID with better error handling
    let board = null;
    try {
      const boardRes = await makeJiraRequest(`${config.baseUrl}/rest/agile/1.0/board`, {
        headers,
      });

      if (boardRes.ok) {
        const boards = await boardRes.json();
        board = boards.values?.find((b: any) => b.location?.projectKey === projectKey);
      }
    } catch (error) {
      warnings.push(`Could not fetch boards: ${error}`);
    }

    if (!board) {
      warnings.push(`No board found for project ${projectKey}. Sprint operations will be skipped.`);
    }

    // Get Epic Link field ID for company-managed projects
    let epicLinkField = null;
    if (!isTeamManaged) {
      try {
        const metaRes = await makeJiraRequest(
          `${config.baseUrl}/rest/api/3/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes.fields`,
          { headers }
        );

        if (metaRes.ok) {
          const metaData = await metaRes.json();
          for (const project of metaData.projects || []) {
            for (const issueType of project.issuetypes || []) {
              for (const [fieldId, field] of Object.entries(issueType.fields || {})) {
                if ((field as any).name === 'Epic Link') {
                  epicLinkField = fieldId;
                  break;
                }
              }
              if (epicLinkField) break;
            }
            if (epicLinkField) break;
          }
        }
      } catch (error) {
        warnings.push(`Could not fetch field metadata: ${error}`);
      }
    }

    // Store created issue keys by their titles for linking
    const issueKeyMap = new Map<string, string>();
    const createdIssues: string[] = [];
    const failedIssues: string[] = [];

    // 1. Create Epics First
    const epicTasks = projectData.tasks.filter((task: any) => task.type === "Epic");
    const nonEpicTasks = projectData.tasks.filter((task: any) => task.type !== "Epic");

    for (const task of epicTasks) {
      try {
        const epic = await createIssue(config, headers, {
          projectKey: projectKey,
          summary: task.title,
          description: task.description,
          issueType: "Epic",
          assignee: task.assignee,
          dueDate: task.dueDate,
          isTeamManaged,
        });

        if (epic) {
          issueKeyMap.set(task.title, epic.key);
          createdIssues.push(epic.key);
          console.log(`Created epic: ${task.title} -> ${epic.key}`);
        } else {
          failedIssues.push(task.title);
          warnings.push(`Failed to create epic: ${task.title}`);
        }
      } catch (error) {
        failedIssues.push(task.title);
        warnings.push(`Error creating epic "${task.title}": ${error}`);
      }
    }

    // 2. Create sprints if needed and board is available
    const sprintMap = new Map();
    if (board) {
      const uniqueSprints = [...new Set(projectData.tasks.map((t: any) => t.sprint).filter(Boolean))];
      
      for (const sprintName of uniqueSprints) {
        try {
          const sprint = await createSprint(config, headers, board.id, sprintName);
          if (sprint) {
            sprintMap.set(sprintName, sprint.id);
            console.log(`Created sprint: ${sprintName} (ID: ${sprint.id})`);
          } else {
            warnings.push(`Failed to create sprint: ${sprintName}`);
          }
        } catch (error) {
          warnings.push(`Error creating sprint "${sprintName}": ${error}`);
        }
      }
    }

    // 3. Create Other Issues (Stories, Tasks, Bugs)
    for (const task of nonEpicTasks) {
      try {
        // Get epic key if epic is specified
        let epicKey: string | undefined;
        if (task.epic) {
          epicKey = issueKeyMap.get(task.epic);
          
          if (!epicKey && task.epic.includes('-') && task.epic.startsWith(projectKey)) {
            epicKey = task.epic;
            console.log(`Using provided epic key: ${epicKey}`);
          }
          
          if (!epicKey) {
            warnings.push(`Epic "${task.epic}" not found for task "${task.title}". Skipping epic linkage.`);
          }
        }

        const issue = await createIssue(config, headers, {
          projectKey: projectKey,
          summary: task.title,
          description: task.description,
          issueType: task.type,
          assignee: task.assignee,
          epic: epicKey,
          dueDate: task.dueDate,
          isTeamManaged,
          epicLinkField,
        });

        if (issue) {
          issueKeyMap.set(task.title, issue.key);
          createdIssues.push(issue.key);
          console.log(`Created ${task.type}: ${task.title} -> ${issue.key}`);

          // Add to sprint if specified and sprint exists
          if (task.sprint && sprintMap.has(task.sprint)) {
            try {
              const sprintId = sprintMap.get(task.sprint);
              const addedToSprint = await addIssueToSprint(config, headers, sprintId, issue.key);
              if (addedToSprint) {
                console.log(`Added ${issue.key} to sprint ${task.sprint}`);
              } else {
                warnings.push(`Failed to add ${issue.key} to sprint ${task.sprint}`);
              }
            } catch (error) {
              warnings.push(`Error adding ${issue.key} to sprint ${task.sprint}: ${error}`);
            }
          } else if (task.sprint) {
            warnings.push(`Sprint "${task.sprint}" not found for task "${task.title}"`);
          }
        } else {
          failedIssues.push(task.title);
          warnings.push(`Failed to create ${task.type}: ${task.title}`);
        }
      } catch (error) {
        failedIssues.push(task.title);
        warnings.push(`Error creating ${task.type} "${task.title}": ${error}`);
      }
    }

    // 4. Create Issue Links (Blocks) after all issues are created
    const blockingTasks = projectData.tasks.filter((task: any) => task.blocks);
    for (const task of blockingTasks) {
      try {
        const outwardIssueKey = issueKeyMap.get(task.title);
        
        let inwardIssueKey: string | undefined;
        inwardIssueKey = issueKeyMap.get(task.blocks);
        
        if (!inwardIssueKey && task.blocks.includes('-') && task.blocks.startsWith(projectKey)) {
          inwardIssueKey = task.blocks;
          console.log(`Using provided issue key for blocking: ${inwardIssueKey}`);
        }

        if (outwardIssueKey && inwardIssueKey) {
          const linked = await createIssueLink(config, headers, outwardIssueKey, inwardIssueKey, "Blocks");
          if (linked) {
            console.log(`Created blocking link: ${task.title} blocks ${task.blocks}`);
          } else {
            warnings.push(`Failed to create blocking link: ${task.title} blocks ${task.blocks}`);
          }
        } else {
          if (!outwardIssueKey) {
            warnings.push(`Could not find issue key for task title: "${task.title}"`);
          }
          if (!inwardIssueKey) {
            warnings.push(`Could not find issue key for blocked task title: "${task.blocks}"`);
          }
        }
      } catch (error) {
        warnings.push(`Error creating blocking link for "${task.title}": ${error}`);
      }
    }

    // Check if we have any successful operations
    if (createdIssues.length === 0) {
      return {
        success: false,
        data: `No issues were created successfully. Failed issues: ${failedIssues.join(', ')}`,
        error: "No issues created"
      };
    }

    return {
      success: true,
      data: {
        projectKey: projectKey,
        createdIssues,
        boardUrl: `${config.baseUrl}/jira/software/projects/${projectKey}/boards`,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      data: `Failed to create Jira issues: ${error.message}`,
      error: error.message,
    };
  }
}

async function createIssue(config: JiraConfig, headers: any, issueData: any) {
  try {
    const payload: any = {
      fields: {
        project: { key: issueData.projectKey },
        summary: issueData.summary,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ text: issueData.description || "No description provided", type: "text" }],
            },
          ],
        },
        issuetype: { name: issueData.issueType },
      },
    };

    // Handle assignee with better error handling
    if (issueData.assignee) {
      try {
        const userRes = await makeJiraRequest(
          `${config.baseUrl}/rest/api/3/user/search?query=${encodeURIComponent(issueData.assignee)}`,
          { headers }
        );
        
        if (userRes.ok) {
          const users = await userRes.json();
          if (users.length > 0) {
            payload.fields.assignee = { id: users[0].accountId };
          } else {
            console.warn(`Could not find assignee with email: ${issueData.assignee}`);
          }
        } else {
          console.warn(`Failed to search for assignee: ${issueData.assignee}`);
        }
      } catch (error) {
        console.warn(`Error searching for assignee "${issueData.assignee}": ${error}`);
      }
    }

    // Handle epic linking with better validation
    if (issueData.epic && issueData.issueType !== "Epic") {
      console.log(`Linking ${issueData.issueType} to epic: ${issueData.epic}, Team-managed: ${issueData.isTeamManaged}`);
      
      if (issueData.isTeamManaged) {
        payload.fields.parent = { key: issueData.epic };
        console.log(`Using parent field for epic link`);
      } else if (issueData.epicLinkField) {
        payload.fields[issueData.epicLinkField] = issueData.epic;
        console.log(`Using Epic Link field ${issueData.epicLinkField} for epic link`);
      } else {
        console.warn(`No epic link field found for company-managed project, cannot link to epic.`);
      }
    }

    // Validate and set due date
    if (issueData.dueDate) {
      const dueDate = new Date(issueData.dueDate);
      if (!isNaN(dueDate.getTime())) {
        payload.fields.duedate = issueData.dueDate;
      } else {
        console.warn(`Invalid due date format: ${issueData.dueDate}`);
      }
    }

    console.log(`Creating issue payload:`, JSON.stringify(payload, null, 2));

    const res = await makeJiraRequest(`${config.baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Failed to create issue "${issueData.summary}": ${res.status} ${errorText}`);
      return null;
    }

    return await res.json();
  } catch (error: any) {
    console.error(`Error creating issue: ${error.message}`);
    return null;
  }
}

async function createSprint(config: JiraConfig, headers: any, boardId: number, sprintName: string) {
  try {
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days from now

    const formatDate = (date: Date) => {
      return date.toISOString().replace(/\.\d{3}Z$/, '.000Z');
    };

    const payload = {
      name: sprintName,
      originBoardId: boardId,
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      goal: `Sprint: ${sprintName}`,
    };

    console.log(`Creating sprint payload:`, JSON.stringify(payload, null, 2));

    const res = await makeJiraRequest(`${config.baseUrl}/rest/agile/1.0/sprint`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Failed to create sprint "${sprintName}": ${res.status} ${errorText}`);
      return null;
    }

    return await res.json();
  } catch (error: any) {
    console.error(`Error creating sprint: ${error.message}`);
    return null;
  }
}

async function addIssueToSprint(config: JiraConfig, headers: any, sprintId: number, issueKey: string) {
  try {
    const payload = {
      issues: [issueKey],
    };

    const res = await makeJiraRequest(`${config.baseUrl}/rest/agile/1.0/sprint/${sprintId}/issue`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Failed to add issue ${issueKey} to sprint ${sprintId}: ${res.status} ${errorText}`);
      return false;
    }

    return true;
  } catch (error: any) {
    console.error(`Error adding issue to sprint: ${error.message}`);
    return false;
  }
}

async function createIssueLink(config: JiraConfig, headers: any, outwardIssueKey: string, inwardIssueKey: string, linkType: string) {
  try {
    // First, check if the link type exists
    const linkTypesRes = await makeJiraRequest(`${config.baseUrl}/rest/api/3/issueLinkType`, {
      headers,
    });

    if (linkTypesRes.ok) {
      const linkTypes = await linkTypesRes.json();
      const availableLinkType = linkTypes.issueLinkTypes?.find((lt: any) => 
        lt.name === linkType || lt.inward === linkType || lt.outward === linkType
      );
      
      if (!availableLinkType) {
        console.warn(`Link type "${linkType}" not found. Available types: ${linkTypes.issueLinkTypes?.map((lt: any) => lt.name).join(', ')}`);
        return false;
      }
    }

    const payload = {
      type: { name: linkType },
      inwardIssue: { key: inwardIssueKey },
      outwardIssue: { key: outwardIssueKey },
    };

    console.log(`Creating issue link payload:`, JSON.stringify(payload, null, 2));

    const res = await makeJiraRequest(`${config.baseUrl}/rest/api/3/issueLink`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Failed to create issue link (${linkType}) from ${outwardIssueKey} to ${inwardIssueKey}: ${res.status} ${errorText}`);
      return false;
    }

    console.log(`Successfully created issue link: ${outwardIssueKey} ${linkType} ${inwardIssueKey}`);
    return true;
  } catch (error: any) {
    console.error(`Error creating issue link: ${error.message}`);
    return false;
  }
}