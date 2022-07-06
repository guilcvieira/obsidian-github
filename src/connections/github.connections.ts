import { Notice } from "obsidian"
import { Octokit } from "@octokit/core"
import { OctokitOptions } from "@octokit/core/dist-types/types"
import { Issue, obsidianGitHubPluginSettings, ProjectsResponse } from "src/interfaces"

export const getIssues = async (
    data: obsidianGitHubPluginSettings,
    page: number,
    perPageIssues: number
): Promise<Issue[]> => {
    const octokit = new Octokit({ ...data })

    let issues: Array<Issue> = []

    await octokit.request('GET /repos/{owner}/{repo}/issues', {
        owner: data.owner,
        repo: data.repo,
        per_page: perPageIssues,
        page: page,
        state: 'all',
        filter: 'repo',
        since: data.lastMerge
    })
        .then((res: OctokitOptions) => {
            issues = res.data
        })
        .catch((err: OctokitOptions) => {
            new Notice(err.message)
            return false
        })
        .finally(() => new Notice(`Issues from ${data.owner}/${data.repo} loaded - page: ${page}`))

    return issues
}

export const graphicQLTest = async (data: obsidianGitHubPluginSettings, page: number, perPageIssues: number): Promise<Array<Issue>> => {
    let result: Array<Issue> = []
    const projects = JSON.stringify({
        "query": `
            query {
                organization(login: "${data.owner}") {
                    projectV2(number: ${data.project}) {
                        ... on ProjectV2 {
                            items(first: ${perPageIssues}) {
                                pageInfo {
                                    hasNextPage
                                }
                                nodes {
                                    id
                                    content {
                                        ...on Issue {
                                            title
                                            number
                                            body
                                            labels(first: 5) {
                                                edges {
                                                    node {
                                                        name
                                                    }
                                                }
                                            }
                                            assignees(first: 10) {
                                                nodes {
                                                    login
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        `
    })

    await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `token ${data.auth}`
        },
        body: projects
    })
        .then(async res => result = extractIssues(await res.json()))
        .catch(e => new Notice(e.message))

    return result
}

const extractIssues = (data: ProjectsResponse): Array<Issue> => {
    const issues = data.data.organization.projectV2.items.nodes
    return issues
}

// https://api.github.com/graphql