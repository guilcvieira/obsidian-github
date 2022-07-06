export interface obsidianGitHubPluginSettings {
    auth: string
    owner: string
    repo: string
    project: string
    onlyLinked: string
    lastMerge: string
}

export interface Issue {
    title: string
    assignees: Array<User>
    user: User
    number: number
    labels: Array<Label>
    state: string
    updated_at: string
    created_at: string
    html_url: string
    body: string
}

export interface User {
    login: string
}

export interface Label {
    name: string
}

export interface ProjectsResponse {
    data: {
        organization: {
            projectV2: {
                items: {
                    pageInfo: {
                        hasNextPage: boolean
                    }
                    nodes: Array<Issue>
                }
            }
        }
    }
}