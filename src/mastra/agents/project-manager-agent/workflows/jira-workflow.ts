// Jira Task Enhancement Workflow - Fixed for Team-Managed Projects Only
import { Agent } from "@mastra/core/agent";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { model } from "../../../config";

const agent = new Agent({
  name: "Jira Task Enhancement Agent",
  model,
  instructions: `
    You are an expert project manager and agile coach. Your role is to transform messy, unstructured task descriptions into well-organized, actionable Jira epics and stories.

    Given a project description or messy task list, you will:
    1. Analyze the content and identify the main project theme for the Epic
    2. Break down complex tasks into manageable Stories and Subtasks
    3. Create logical story groupings and priorities
    4. Generate comprehensive acceptance criteria for each story
    5. Suggest realistic time estimates and story points
    6. Organize everything into a structured Jira format

    Structure your response as a JSON object with the following format:
    {
      "epicTitle": "Clear, descriptive epic title",
      "epicDescription": "Detailed epic description",
      "sprintName": "Sprint name",
      "sprintGoal": "Clear sprint goal",
      "sprintDurationDays": 14,
      "stories": [
        {
          "title": "Clear, actionable story title",
          "description": "Detailed story description",
          "acceptanceCriteria": [
            "Given/When/Then acceptance criteria 1",
            "Given/When/Then acceptance criteria 2",
            "Given/When/Then acceptance criteria 3"
          ],
          "storyPoints": 5,
          "priority": "High/Medium/Low",
          "labels": ["frontend", "backend", "api", "ui", "testing"],
          "subtasks": [
            {
              "title": "Specific subtask title",
              "description": "Detailed subtask description",
              "estimateHours": 4
            }
          ]
        }
      ]
    }

    Guidelines:
    - Create 1 Epic to group all related work
    - Generate 3-8 Stories maximum per epic
    - Each story should have 2-5 acceptance criteria
    - Use story points (1, 2, 3, 5, 8, 13) for estimation
    - Create 1-4 subtasks per story when needed
    - Use clear, user-story format: "As a [user], I want [goal] so that [benefit]"
    - Include realistic time estimates
    - Add relevant labels (frontend, backend, api, ui, testing, etc.)
    - Ensure all stories follow INVEST principles (Independent, Negotiable, Valuable, Estimable, Small, Testable)
    - Sprint should be 1-4 weeks (7-28 days)

    CRITICAL: You must respond with ONLY valid JSON. Do not include any markdown formatting, code blocks, or additional text. Start your response with { and end with }. No explanatory text before or after the JSON.
  `,
});

// Input schema for the workflow
const workflowInputSchema = z.object({
  taskDescription: z.string().describe("The messy tasks or project description to enhance"),
  sourceProjectKey: z.string().optional().describe("Existing project key to read from (optional)"),
  targetProjectKey: z.string().describe("Target project key to create the enhanced issues in"),
  assigneeEmail: z.string().optional().describe("Email of the assignee for created issues"),
  sprintName: z.string().optional().describe("Custom sprint name (optional)"),
});

// Enhanced task structure schema
const enhancedTaskSchema = z.object({
  epicTitle: z.string(),
  epicDescription: z.string(),
  sprintName: z.string(),
  sprintGoal: z.string(),
  sprintDurationDays: z.number(),
  stories: z.array(z.object({
    title: z.string(),
    description: z.string(),
    acceptanceCriteria: z.array(z.string()),
    storyPoints: z.number(),
    priority: z.string(),
    labels: z.array(z.string()),
    subtasks: z.array(z.object({
      title: z.string(),
      description: z.string(),
      estimateHours: z.number(),
    })),
  })),
});

// Jira API configuration
const JIRA_BASE_URL = process.env.JIRA_BASE_URL || "https://your-domain.atlassian.net";

// Helper function to get auth configuration
function getAuth() {
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  if (!email || !apiToken) {
    throw new Error("JIRA_EMAIL and JIRA_API_TOKEN must be set in environment variables");
  }
  return { email, apiToken };
}

// Helper function to make authenticated requests
async function jiraRequest(endpoint: string, method: string = 'GET', data?: any) {
  const { email, apiToken } = getAuth();
  const url = `${JIRA_BASE_URL}${endpoint}`;
  
  const options: RequestInit = {
    method,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
    },
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jira API error: ${response.status} ${response.statusText} - ${errorText}`);
  }
  
  return response.json();
}

// Helper function to validate if project is team-managed
// Helper function to validate if project is team-managed - FIXED VERSION
async function validateTeamManagedProject(projectKey: string): Promise<{ isValid: boolean; project?: any; errorMessage?: string }> {
  try {
    // Get project info
    const project = await jiraRequest(`/rest/api/3/project/${projectKey}`);
    
    // Check project style - this is the key difference from your original code
    const projectTypeKey = project.projectTypeKey;
    const style = project.style;
    const simplified = project.simplified;
    
    console.log(`🔍 Project "${projectKey}" details:`, {
      projectTypeKey,
      style,
      simplified,
      projectType: project.projectType,
      projectCategory: project.projectCategory
    });
    
    // Team-managed projects have style: "next-gen" (like in your Python script)
    // Company-managed projects have style: "classic" 
    const isTeamManaged = style === "next-gen";
    
    console.log(`🔍 Project style check:`, {
      style,
      isTeamManaged: isTeamManaged
    });
    
    if (!isTeamManaged) {
      return {
        isValid: false,
        errorMessage: `❌ Project "${projectKey}" appears to be a company-managed project (style: "${style}"). This workflow only works with team-managed projects.

🔧 HOW TO CREATE A TEAM-MANAGED PROJECT:
1. Go to your Jira instance: ${JIRA_BASE_URL}
2. Click "Create project"
3. Select "Scrum" or "Kanban" template
4. Choose "Team-managed" (NOT Company-managed)
5. Name your project and set the project key as: ${projectKey}
6. Click "Create project"

🔍 PROJECT DETAILS FOUND:
- Project Type: ${projectTypeKey}
- Style: ${style} (should be "next-gen" for team-managed)
- Simplified: ${simplified}

Team-managed projects are required because they:
- Support direct Epic-Story parent relationships
- Have simpler issue hierarchies
- Are optimized for agile workflows`
      };
    }
    
    // Additional validation: Check if Epic issue type exists
    try {
      const createMeta = await jiraRequest(`/rest/api/3/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes.fields`);
      
      let hasEpicType = false;
      let supportsParentField = false;
      
      if (createMeta.projects && createMeta.projects.length > 0) {
        const projectMeta = createMeta.projects[0];
        
        // Check if Epic issue type exists
        const epicType = projectMeta.issuetypes.find((type: any) => type.name === 'Epic');
        hasEpicType = !!epicType;
        
        // Check if Story issue type supports parent field (team-managed feature)
        const storyType = projectMeta.issuetypes.find((type: any) => type.name === 'Story');
        if (storyType && storyType.fields) {
          supportsParentField = !!storyType.fields.parent;
        }
      }
      
      console.log(`🔍 Project capabilities:`, {
        hasEpicType,
        supportsParentField
      });
      
      if (!hasEpicType) {
        return {
          isValid: false,
          errorMessage: `❌ Project "${projectKey}" does not have Epic issue type available. Please ensure your project template supports Epics.`
        };
      }
      
    } catch (metaError) {
      console.warn(`Could not check project capabilities: ${metaError}`);
      // Don't fail validation just because we can't check capabilities
    }
    
    return { isValid: true, project };
    
  } catch (error) {
    return {
      isValid: false,
      errorMessage: `❌ Project "${projectKey}" not found or not accessible. Please ensure:

1. The project exists in your Jira instance
2. You have access to the project
3. The project key is correct: ${projectKey}

🔧 TO CREATE A NEW TEAM-MANAGED PROJECT:
1. Go to your Jira instance: ${JIRA_BASE_URL}
2. Click "Create project"
3. Select "Scrum" template
4. Choose "Team-managed" (NOT Company-managed)
5. Name your project and set the project key as: ${projectKey}
6. Click "Create project"

Error details: ${error}`
    };
  }
}
// Helper function to get assignee account ID
async function getAssigneeAccountId(email: string): Promise<string | null> {
  try {
    const users = await jiraRequest(`/rest/api/3/user/search?query=${email}`);
    return users.length > 0 ? users[0].accountId : null;
  } catch (error) {
    console.warn(`Could not find user with email ${email}:`, error);
    return null;
  }
}

// Helper function to get board ID for project
async function getBoardId(projectKey: string): Promise<number | null> {
  try {
    const boards = await jiraRequest('/rest/agile/1.0/board');
    const board = boards.values.find((b: any) => b.location?.projectKey === projectKey);
    return board ? board.id : null;
  } catch (error) {
    console.warn(`Could not find board for project ${projectKey}:`, error);
    return null;
  }
}

// Step 1: Validate Project is Team-Managed
const validateProject = createStep({
  id: "validate-project",
  description: "Validates that the target project exists and is team-managed",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({
    project: z.any(),
    originalInput: workflowInputSchema,
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error("Input data not found");
    }

    console.log(`🔍 Validating project: ${inputData.targetProjectKey}`);
    
    const validation = await validateTeamManagedProject(inputData.targetProjectKey);
    
    if (!validation.isValid) {
      console.error(`❌ Project validation failed: ${validation.errorMessage}`);
      throw new Error(validation.errorMessage);
    }

    console.log(`✅ Project "${inputData.targetProjectKey}" is team-managed and valid`);
    
    return {
      project: validation.project,
      originalInput: inputData,
    };
  },
});

// Step 2: Read existing project data (if specified)
const readExistingProject = createStep({
  id: "read-existing-project",
  description: "Reads existing Jira project data if source project key is provided",
  inputSchema: z.object({
    project: z.any(),
    originalInput: workflowInputSchema,
  }),
  outputSchema: z.object({
    existingProjectData: z.string().optional(),
    project: z.any(),
    originalInput: workflowInputSchema,
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error("Input data not found");
    }

    let existingProjectData = "";

    if (inputData.originalInput.sourceProjectKey) {
      try {
        // Validate source project as well
        const sourceValidation = await validateTeamManagedProject(inputData.originalInput.sourceProjectKey);
        
        if (!sourceValidation.isValid) {
          console.warn(`Source project ${inputData.originalInput.sourceProjectKey} is not team-managed, skipping data read`);
          return {
            existingProjectData: "",
            project: inputData.project,
            originalInput: inputData.originalInput,
          };
        }

        // Get recent issues (last 50)
        const searchResult = await jiraRequest(
          `/rest/api/3/search?jql=project=${inputData.originalInput.sourceProjectKey}&maxResults=50&fields=summary,description,issuetype,status,assignee,priority,labels,subtasks`
        );

        const sourceProject = sourceValidation.project;
        let projectStructure = `Project: ${sourceProject.name} (${sourceProject.key})\n`;
        projectStructure += `Description: ${sourceProject.description || 'No description'}\n\n`;

        // Group issues by type
        const issuesByType = searchResult.issues.reduce((acc: any, issue: any) => {
          const type = issue.fields.issuetype.name;
          if (!acc[type]) acc[type] = [];
          acc[type].push(issue);
          return acc;
        }, {});

        for (const [issueType, issues] of Object.entries(issuesByType)) {
          projectStructure += `${issueType}s:\n`;
          for (const issue of issues as any[]) {
            projectStructure += `  - ${issue.fields.summary}\n`;
            if (issue.fields.description) {
              const desc = typeof issue.fields.description === 'string' 
                ? issue.fields.description 
                : 'Rich text description';
              projectStructure += `    Description: ${desc.substring(0, 200)}${desc.length > 200 ? '...' : ''}\n`;
            }
            if (issue.fields.labels && issue.fields.labels.length > 0) {
              projectStructure += `    Labels: ${issue.fields.labels.join(', ')}\n`;
            }
            if (issue.fields.assignee) {
              projectStructure += `    Assignee: ${issue.fields.assignee.displayName}\n`;
            }
            projectStructure += `    Status: ${issue.fields.status.name}\n`;
            if (issue.fields.subtasks && issue.fields.subtasks.length > 0) {
              projectStructure += `    Subtasks: ${issue.fields.subtasks.length}\n`;
            }
          }
          projectStructure += "\n";
        }

        existingProjectData = projectStructure;
        console.log(`✅ Read data from source project: ${inputData.originalInput.sourceProjectKey}`);
      } catch (error) {
        console.warn(`Could not read existing project: ${error}`);
        existingProjectData = "";
      }
    }

    return {
      existingProjectData,
      project: inputData.project,
      originalInput: inputData.originalInput,
    };
  },
});

// Step 3: Enhance tasks using AI
const enhanceTasks = createStep({
  id: "enhance-tasks",
  description: "Uses AI to enhance and structure the task description into Jira format",
  inputSchema: z.object({
    existingProjectData: z.string().optional(),
    project: z.any(),
    originalInput: workflowInputSchema,
  }),
  outputSchema: z.object({
    enhancedTasks: enhancedTaskSchema,
    project: z.any(),
    originalInput: workflowInputSchema,
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error("Input data not found");
    }

    let prompt = `Transform the following project description into a well-structured Jira epic with stories and subtasks:

Project Description:
${inputData.originalInput.taskDescription}

Target Project Key: ${inputData.originalInput.targetProjectKey}`;

    if (inputData.originalInput.sprintName) {
      prompt += `\nPreferred Sprint Name: ${inputData.originalInput.sprintName}`;
    }

    if (inputData.existingProjectData) {
      prompt += `\n\nExisting Project Data to Consider:
${inputData.existingProjectData}`;
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
      if (!enhancedTasks.epicTitle || !enhancedTasks.stories || !Array.isArray(enhancedTasks.stories)) {
        throw new Error("Invalid enhanced tasks structure");
      }
    } catch (error) {
      throw new Error(`Failed to parse AI response as JSON: ${error}. Response was: ${enhancedTasksText.substring(0, 200)}...`);
    }

    console.log(`✅ Enhanced tasks: Epic "${enhancedTasks.epicTitle}" with ${enhancedTasks.stories.length} stories`);

    return {
      enhancedTasks,
      project: inputData.project,
      originalInput: inputData.originalInput,
    };
  },
});

// Step 4: Create Jira Issues in Team-Managed Project - ENHANCED VERSION
const createJiraIssues = createStep({
  id: "create-jira-issues",
  description: "Creates the enhanced Jira epic, stories, subtasks, and sprint in the team-managed project",
  inputSchema: z.object({
    enhancedTasks: enhancedTaskSchema,
    project: z.any(),
    originalInput: workflowInputSchema,
  }),
  outputSchema: z.object({
    epicUrl: z.string(),
    sprintUrl: z.string(),
    summary: z.string(),
    createdIssues: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error("Input data not found");
    }

    const { enhancedTasks, project, originalInput } = inputData;
    const warnings: string[] = [];

    // Get project capabilities
    let projectCapabilities = {
      supportsPriority: false,
      supportsSubtasks: false,
      supportsStoryPoints: false,
      priorityFieldId: null as string | null,
      storyPointsFieldId: null as string | null,
    };

    try {
      const createMeta = await jiraRequest(`/rest/api/3/issue/createmeta?projectKeys=${originalInput.targetProjectKey}&expand=projects.issuetypes.fields`);
      
      if (createMeta.projects && createMeta.projects.length > 0) {
        const projectMeta = createMeta.projects[0];
        
        // Check Story issue type capabilities
        const storyType = projectMeta.issuetypes.find((type: any) => type.name === 'Story');
        if (storyType && storyType.fields) {
          // Check priority field
          if (storyType.fields.priority) {
            projectCapabilities.supportsPriority = true;
            projectCapabilities.priorityFieldId = 'priority';
          }
          
          // Check for story points field (common field IDs)
          const storyPointFieldIds = ['customfield_10016', 'customfield_10002', 'customfield_10026'];
          for (const fieldId of storyPointFieldIds) {
            if (storyType.fields[fieldId]) {
              projectCapabilities.supportsStoryPoints = true;
              projectCapabilities.storyPointsFieldId = fieldId;
              break;
            }
          }
        }
        
        // Check if Sub-task issue type exists
        const subtaskType = projectMeta.issuetypes.find((type: any) => type.name === 'Sub-task');
        if (subtaskType) {
          projectCapabilities.supportsSubtasks = true;
        }
      }
      
      console.log('🔍 Project capabilities:', projectCapabilities);
      
    } catch (error) {
      console.warn('Could not check project capabilities:', error);
    }

    // Get assignee account ID if provided
    let assigneeAccountId = null;
    if (originalInput.assigneeEmail) {
      assigneeAccountId = await getAssigneeAccountId(originalInput.assigneeEmail);
      if (assigneeAccountId) {
        console.log(`✅ Found assignee: ${originalInput.assigneeEmail}`);
      } else {
        console.warn(`⚠️ Could not find assignee: ${originalInput.assigneeEmail}`);
      }
    }

    // Create Epic for team-managed project
    const epicPayload = {
      fields: {
        project: { key: originalInput.targetProjectKey },
        summary: enhancedTasks.epicTitle,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ text: enhancedTasks.epicDescription, type: "text" }]
            }
          ]
        },
        issuetype: { name: "Epic" },
        ...(assigneeAccountId && { assignee: { id: assigneeAccountId } }),
      }
    };

    const epicResponse = await jiraRequest("/rest/api/3/issue", "POST", epicPayload);
    const epicKey = epicResponse.key;
    const createdIssues = [epicKey];

    console.log(`✅ Epic created: ${epicKey}`);

    // Create Stories for team-managed project
    const storyKeys = [];
    let storiesCreated = 0;
    let subtasksCreated = 0;
    
    for (const story of enhancedTasks.stories) {
      const storyFields: any = {
        project: { key: originalInput.targetProjectKey },
        summary: story.title,
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ text: story.description, type: "text" }]
            },
            {
              type: "paragraph",
              content: [{ text: "\n\nAcceptance Criteria:", type: "text" }]
            },
            ...story.acceptanceCriteria.map(criteria => ({
              type: "paragraph",
              content: [{ text: `• ${criteria}`, type: "text" }]
            }))
          ]
        },
        issuetype: { name: "Story" },
        labels: story.labels,
        parent: { key: epicKey }, // This is the key for team-managed projects
        ...(assigneeAccountId && { assignee: { id: assigneeAccountId } }),
      };

      // Add priority if supported
      if (projectCapabilities.supportsPriority) {
        try {
          storyFields.priority = { name: story.priority === "High" ? "High" : story.priority === "Low" ? "Low" : "Medium" };
        } catch (error) {
          console.warn(`Could not set priority for story: ${story.title}`);
        }
      }

      // Add story points if supported
      if (projectCapabilities.supportsStoryPoints && projectCapabilities.storyPointsFieldId) {
        try {
          storyFields[projectCapabilities.storyPointsFieldId] = story.storyPoints;
        } catch (error) {
          console.warn(`Could not set story points for story: ${story.title}`);
        }
      }

      const storyResponse = await jiraRequest("/rest/api/3/issue", "POST", { fields: storyFields });
      const storyKey = storyResponse.key;
      storyKeys.push(storyKey);
      createdIssues.push(storyKey);
      storiesCreated++;
      console.log(`✅ Story created: ${storyKey}`);

      // Create Subtasks if supported
      if (projectCapabilities.supportsSubtasks) {
        for (const subtask of story.subtasks) {
          const subtaskPayload = {
            fields: {
              project: { key: originalInput.targetProjectKey },
              summary: subtask.title,
              description: {
                type: "doc",
                version: 1,
                content: [
                  {
                    type: "paragraph",
                    content: [{ text: subtask.description, type: "text" }]
                  }
                ]
              },
              issuetype: { name: "Sub-task" },
              parent: { key: storyKey },
              ...(assigneeAccountId && { assignee: { id: assigneeAccountId } }),
            }
          };

          try {
            // Add time estimate if supported
            subtaskPayload.fields.timetracking = {
              originalEstimate: `${subtask.estimateHours}h`
            };
          } catch (error) {
            // Time tracking might not be enabled
          }

          const subtaskResponse = await jiraRequest("/rest/api/3/issue", "POST", subtaskPayload);
          createdIssues.push(subtaskResponse.key);
          subtasksCreated++;
          console.log(`✅ Subtask created: ${subtaskResponse.key}`);
        }
      }
    }

    // Create Sprint
    const boardId = await getBoardId(originalInput.targetProjectKey);
    let sprintUrl = "";
    let sprintCreated = false;
    
    if (boardId) {
      try {
        const now = new Date();
        const endDate = new Date(now.getTime() + enhancedTasks.sprintDurationDays * 24 * 60 * 60 * 1000);
        
        const sprintPayload = {
          name: enhancedTasks.sprintName,
          originBoardId: boardId,
          startDate: now.toISOString(),
          endDate: endDate.toISOString(),
          goal: enhancedTasks.sprintGoal,
        };

        console.log(`🔄 Creating sprint with payload:`, sprintPayload);
        const sprintResponse = await jiraRequest("/rest/agile/1.0/sprint", "POST", sprintPayload);
        const sprintId = sprintResponse.id;
        
        if (sprintId) {
          // Add stories to sprint
          const addIssuesToSprintPayload = {
            issues: storyKeys,
          };
          
          console.log(`🔄 Adding ${storyKeys.length} stories to sprint ${sprintId}`);
          const addToSprintResponse = await jiraRequest(`/rest/agile/1.0/sprint/${sprintId}/issue`, "POST", addIssuesToSprintPayload);
          console.log(`📥 Add to sprint response:`, addToSprintResponse);
          
          sprintUrl = `${JIRA_BASE_URL}/secure/RapidBoard.jspa?rapidView=${boardId}&sprint=${sprintId}`;
          sprintCreated = true;
          console.log(`✅ Sprint created: ${enhancedTasks.sprintName} (ID: ${sprintId})`);
          console.log(`✅ Added ${storyKeys.length} stories to sprint`);
        }
      } catch (sprintError) {
        console.error(`❌ Sprint creation failed:`, sprintError);
        warnings.push("Sprint creation failed - you may need to create it manually");
      }
    } else {
      console.warn(`⚠️ Could not find board for project ${originalInput.targetProjectKey}, sprint not created`);
      warnings.push("No board found for sprint creation");
    }

    // Generate warnings for unsupported features
    if (!projectCapabilities.supportsPriority) {
      warnings.push("Priority field is not configured in your project");
    }
    if (!projectCapabilities.supportsSubtasks) {
      warnings.push("Sub-task issue type is not available in your project");
    }
    if (!projectCapabilities.supportsStoryPoints) {
      warnings.push("Story points field is not configured in your project");
    }

    // Build summary message
    const epicUrl = `${JIRA_BASE_URL}/browse/${epicKey}`;
    
    let summary = `✅ Project created successfully!\n\n📊 CREATED:\n- 1 Epic: "${enhancedTasks.epicTitle}"\n- ${storiesCreated} Stories`;
    
    if (subtasksCreated > 0) {
      summary += `\n- ${subtasksCreated} Subtasks`;
    }
    
    if (sprintCreated) {
      summary += `\n- 1 Sprint: "${enhancedTasks.sprintName}" with ${storyKeys.length} stories`;
    }
    
    if (warnings.length > 0) {
      summary += `\n\n⚠️ CONFIGURATION NEEDED:\nThe following features were skipped because they're not configured in your project:\n`;
      warnings.forEach(warning => {
        summary += `• ${warning}\n`;
      });
      summary += `\nTo enable these features:\n1. Go to your project settings: ${JIRA_BASE_URL}/projects/${originalInput.targetProjectKey}\n2. Configure the missing fields/issue types\n3. Or add them manually to your issues`;
    }

    return {
      epicUrl,
      sprintUrl,
      summary,
      createdIssues,
      warnings,
    };
  },
});// Main workflow

const jiraWorkflow = createWorkflow({
  id: "jira-enhancement-workflow",
  inputSchema: workflowInputSchema,
  outputSchema: z.object({
    epicUrl: z.string(),
    sprintUrl: z.string(),
    summary: z.string(),
    createdIssues: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
})
  .then(validateProject)
  .then(readExistingProject)
  .then(enhanceTasks)
  .then(createJiraIssues);

jiraWorkflow.commit();

export { jiraWorkflow };