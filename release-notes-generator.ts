import { debug, info } from '@actions/core';
import { GitHub } from '@actions/github/lib/utils';
import { components } from "@octokit/openapi-types";
import { Label, ShortcutClient, Story as FullStory, StorySlim } from '@useshortcut/client';
import { render } from 'ejs';

type GithubCommit = components["schemas"]["commit"];
type GithubPR = components["schemas"]["pull-request"];
type GithubPRSimple = components["schemas"]["pull-request-simple"];
type GithubPRComment = components["schemas"]["issue-comment"];

type Story = StorySlim | FullStory; // partials 😱
type ShortCutStoryGithubItemsMap = Map<number, StorySlim | Story>;

export class ReleaseNotesGenerator {
	private issueRegex = /\b(?:fixes|fix|closes|closed|finish|finishes)?\b \[?(?:ch|sc)-?(\d+)]?/gi;

	constructor(
		private githubApi: InstanceType<typeof GitHub>,
		private shortcutApi: ShortcutClient<any>,
		private repositoryOwner: string,
		private repository: string,
		private head: string,
		private base: string,
		private templates: { releasenotes: string, noStories: string },
	) {
	}

	public async generate() {
		debug(`Starting release notes generation`);
		debug(`Repository: ${this.repositoryOwner}/${this.repository}`);
		debug(`Between: ${this.base} and ${this.head}`);

		let commits = [];
		try {
			commits = await this.getCommits();
		} catch (error) {
			throw new Error(`Could not find diff between ${this.head} and ${this.base}`);
		}

		const versionLabel = `Version: ${this.head}`;

		const foundStoriesMap: ShortCutStoryGithubItemsMap = new Map();
		const releaseNotesStoriesMap: ShortCutStoryGithubItemsMap = new Map();
		for await(const storyId of this.parseCommits(commits)) {
			if (foundStoriesMap.has(storyId)) {
				continue;
			}

			try {
				const story = await this.getShortcutStory(storyId);
				foundStoriesMap.set(storyId, story);

				if (story.completed) {
					releaseNotesStoriesMap.set(storyId, story);
					info(`Story found: ${story.name}`);
				} else {
					info(`Story found but not completed. Ignore: ${story.name}`);
				}
			} catch (error) {
				// @todo instanceof check on ClientError is not working...
				if (error.response && error.response.status === 404) {
					info(`Could not find story: ${storyId}`);
				} else {
					throw error;
				}

			}
		}

		if (releaseNotesStoriesMap.size) {
			try {
				const updatedStories = await this.bulkAddVersionLabelToStories(
					[...releaseNotesStoriesMap.keys()],
					versionLabel,
				);

				for (const story of updatedStories) {
					releaseNotesStoriesMap.set(story.id, story);
				}
			} catch (error) {
				throw new Error(`Could not add version label to stories`);
			}
		} else {
			info(`No stories to add version label to.`);
		}

		if (releaseNotesStoriesMap.size) {
			info(`Rendering release notes for ${releaseNotesStoriesMap.size} stories`);
			const label = this.getVersionLabelFromStories(versionLabel, releaseNotesStoriesMap);

			return await this.createReleaseNotes([...releaseNotesStoriesMap.values()], label);
		} else {
			info('No stories, rendering noStories template');
			return render(this.templates.noStories, {
				head: this.head,
				base: this.base,
				repositoryOwner: this.repositoryOwner,
				repository: this.repository,
			});
		}
	}

	private async* parseCommits(commits: GithubCommit[]): AsyncGenerator<number> {
		for (const commit of commits) {
			debug(`Parsing commit ${commit.sha}`);
			let commitMessage: string = commit.commit.message;
			for (const storyId of await this.getIssuesFromString(commitMessage)) {
				debug(` - Found story ${storyId} in commit message`);
				yield storyId;
			}

			const relatedPullRequests = await this.getPRsForCommit(commit.sha);
			for (const relatedPullRequest of relatedPullRequests) {
				debug(` - Found related pull request ${relatedPullRequest.number}`);
				yield* this.parsePR(relatedPullRequest);
			}
		}
	}

	private async* parsePR(PR: GithubPRSimple): AsyncGenerator<number> {
		for (const storyId of await this.getIssuesFromString(PR.title + "\n" + PR.body)) {
			debug(` - Found story ${storyId} in pull request ${PR.number} title/body`);
			yield storyId;
		}

		const comments = await this.getPRComments(PR.number);

		for (const comment of comments) {
			for (const storyId of await this.getIssuesFromString(comment.body)) {
				debug(` - Found story ${storyId} in pull request ${PR.number} comment`);
				yield storyId;
			}
		}
	}

	private* getIssuesFromString(string: string) {
		for (const match of string.matchAll(this.issueRegex)) {
			yield parseInt(match[1]) as number;
		}
	}

	private async getCommits(): Promise<GithubCommit[]> {
		debug(`Getting commits`);
		const commits: GithubCommit[] = await this.githubApi.paginate(
			this.githubApi.rest.repos.compareCommits,
			{
				owner: this.repositoryOwner,
				repo: this.repository,
				base: this.base,
				head: this.head,
				per_page: 100,
			},
			(response) => response.data.commits,
		);
		debug(`Got ${commits.length} commits`);
		return commits;
	}

	private async getPRsForCommit(commit_sha: string) {
		const response = await this.githubApi.rest.repos.listPullRequestsAssociatedWithCommit({
			owner: this.repositoryOwner,
			repo: this.repository,
			commit_sha: commit_sha,
		});
		return response.data;
	}

	private async getPRComments(PRId: number): Promise<GithubPRComment[]> {
		debug(`- Getting comments for PR: ${PRId}`);
		const response = await this.githubApi.rest.issues.listComments({
			owner: this.repositoryOwner,
			repo: this.repository,
			issue_number: PRId,
		});
		return response.data;
	}

	private async getShortcutStory(storyId: number): Promise<Story> {
		debug(`- Getting shortcut story: ${storyId}`);
		return (await this.shortcutApi.getStory(storyId)).data;
	}

	private async bulkAddVersionLabelToStories(
		storiesToVersionLabel: number[],
		versionLabel: string,
	): Promise<StorySlim[]> {
		debug(`Bulk adding version label '${versionLabel}' to ${storiesToVersionLabel.length} shortcut stories`);
		return (await this.shortcutApi.updateMultipleStories({
			story_ids: storiesToVersionLabel,
			labels_add: [{name: versionLabel}],
		})).data;
	}

	private async createReleaseNotes(stories: Story[], version: Label) {
		stories.sort((a: Story, b: Story) => {
			const aDate = a.completed_at || a.updated_at || a.created_at;
			const bDate = b.completed_at || b.updated_at || b.created_at;

			if (aDate === bDate) {
				return 0;
			} else if (aDate > bDate) {
				return -1;
			} else {
				return 1;
			}
		});

		return render(this.templates.releasenotes, {
			head: this.head,
			base: this.base,
			stories: stories,
			version,
			labelVersionFilter: (label: Label) => label.id !== version.id && label.name.indexOf("Version: ") === 0,
			createStoryTypeFilter: (storyType: string) => ((story: Story) => story.story_type === storyType),
			repositoryOwner: this.repositoryOwner,
			repository: this.repository,
		});
	}

	private getVersionLabelFromStories(versionLabel: string, releaseNotesStoriesMap: ShortCutStoryGithubItemsMap) {
		for (const story of releaseNotesStoriesMap.values()) {
			const label = story.labels.find((label) => label.name === versionLabel);

			if (label) {
				return label;
			}
		}

		throw new Error(`Could not find version label ${versionLabel}`);
	}
}
