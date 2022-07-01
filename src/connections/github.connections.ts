import { Notice } from "obsidian"
import { Octokit } from "@octokit/core"
import { OctokitOptions } from "@octokit/core/dist-types/types"
import { Issue, obsidianGitHubPluginSettings } from "src/interfaces"

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
        filter: 'repo'
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