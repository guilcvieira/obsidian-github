export interface obsidianGitHubPluginSettings {
    auth: string
    owner: string
    repo: string
    onlyLinked: string
}

export interface Issue {
    title: string
    assignees: Array<User>
    user: User
    number: number
    labels: Array<Label>
    sprint: string
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