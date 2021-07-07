import {info as logInfo} from '@actions/core';
import {GitHub} from "@actions/github/lib/utils";
import Client, {ID as storyId, Label, Story} from 'clubhouse-lib';
import {render} from 'ejs';
import {components} from "@octokit/openapi-types";

type GithubCommit = components["schemas"]["commit"];
type GithubPR = components["schemas"]["pull-request"];
type GithubPRComment = components["schemas"]["issue-comment"];

type ClubhouseStoryGithubItemsMap = Map<storyId, Story>;

type ClubhouseBulkUpdateStories = {
	story_ids: storyId[]
	labels_add: { name: string }[]
}

export class ReleaseNotesGenerator {
	private issueRegex = /\b(?:fixes|fix|closes|closed|finish|finishes)?\b (?:\[?)ch(?:-?)(\d+)(?:\]?)/gi;
	private prRegex = /pull request \#(\d+)/i;

	constructor(
		private githubApi: InstanceType<typeof GitHub>,
		private clubhouseApi: Client<any, any>,
		private repositoryOwner: string,
		private repository: string,
		private head: string,
		private base: string,
		private templates: { releasenotes: string, noStories: string }
	) {
	}

	public async generate() {
		let commits = [];
		try {
			commits = await this.getCommits();
		} catch (error) {
			throw new Error(`Could not find diff between ${this.head} and ${this.base}`);
		}

		const versionLabel = `Version: ${this.head}`;

		const foundStoriesMap: ClubhouseStoryGithubItemsMap = new Map();
		const releaseNotesStoriesMap: ClubhouseStoryGithubItemsMap = new Map();
		for await(const storyId of this.parseCommits(commits)) {
			if (foundStoriesMap.has(storyId)) {
				continue;
			}

			try {
				const story = await this.getClubhouseStory(storyId);
				foundStoriesMap.set(storyId, story);

				if (story.completed) {
					releaseNotesStoriesMap.set(storyId, story);
					logInfo(`Story found: ${story.name}`);
				} else {
					logInfo(`Story found but not completed. Ignore: ${story.name}`);
				}
			} catch(error) {
				// @todo instanceof check on ClientError is not working...
				if(error.response && error.response.status === 404) {
					logInfo(`Could not find story: ${storyId}`);
				} else {
					throw error;
				}

			}
		}

		if (releaseNotesStoriesMap.size) {
			try {
				const updatedStories = await this.bulkAddVersionLabelToStories(
					[...releaseNotesStoriesMap.keys()],
					versionLabel
				);

				for(const story of updatedStories) {
					releaseNotesStoriesMap.set(story.id, story);
				}
			} catch (error) {
				throw new Error(`Could not add version label to stories`);
			}
		} else {
			logInfo(`No stories to add version label to.`);
		}

		if(releaseNotesStoriesMap.size) {
			const label = this.getVersionLabelFromStories(versionLabel, releaseNotesStoriesMap);

			return await this.createReleaseNotes([...releaseNotesStoriesMap.values()], label);
		} else {
			return render(this.templates.noStories, {
				head: this.head,
				base: this.base,
				repositoryOwner: this.repositoryOwner,
				repository: this.repository
			});
		}
	}

	private async* parseCommits(commits: GithubCommit[]): AsyncGenerator<storyId> {
		for (const commit of commits) {
			for (const storyId of await this.getIssuesFromString(commit.commit.message)) {
				yield storyId;
			}

			if (commit.parents.length >= 2) {
				const match = commit.commit.message.match(this.prRegex);
				if (match) {
					const PRId = parseInt(match[1]);
					yield* this.parsePRs(PRId);
				}
			}
		}
	}

	private async* parsePRs(PRId: number): AsyncGenerator<storyId> {
		const PR = await this.getPR(PRId);

		for (const storyId of await this.getIssuesFromString(PR.title + "\n" + PR.body)) {
			yield storyId;
		}

		if (PR.comments) {
			const comments = await this.getPRComments(PRId);

			for (const comment of comments) {
				for (const storyId of await this.getIssuesFromString(comment.body)) {
					yield storyId;
				}
			}
		}
	}

	private* getIssuesFromString(string: string) {
		for (const match of string.matchAll(this.issueRegex)) {
			yield parseInt(match[1]) as storyId;
		}
	}

	private async getCommits(): Promise<GithubCommit[]> {
		return (await this.githubApi.repos.compareCommits({
			owner: this.repositoryOwner,
			repo: this.repository,
			base: this.base,
			head: this.head
		})).data.commits;
	}

	private async getPR(PRId: number): Promise<GithubPR> {
		return (await this.githubApi.pulls.get({
			owner: this.repositoryOwner,
			repo: this.repository,
			pull_number: PRId
		})).data;
	}

	private async getPRComments(PRId: number): Promise<GithubPRComment[]> {
		return (await this.githubApi.issues.listComments({
			owner: this.repositoryOwner,
			repo: this.repository,
			issue_number: PRId
		})).data;
	}

	private async getClubhouseStory(storyId: storyId): Promise<Story> {
		return await this.clubhouseApi.getStory(storyId);
	}

	private async bulkAddVersionLabelToStories(
		storiesToVersionLabel: storyId[],
		versionLabel: string
	): Promise<Story[]> {
		return await this.clubhouseApi.updateResource<Story[]>("stories/bulk", <ClubhouseBulkUpdateStories>{
			story_ids: storiesToVersionLabel,
			labels_add: [{name: versionLabel}]
		});
	}

	private async createReleaseNotes(stories: Story[], version: Label) {
		stories.sort((a: Story, b: Story) => {
			const aDate = a.completed_at || a.updated_at || a.created_at;
			const bDate = b.completed_at || b.updated_at || b.created_at;

			if (aDate === bDate) {
				return 0
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
			repository: this.repository
		});
	}

	private getVersionLabelFromStories(versionLabel: string, releaseNotesStoriesMap: ClubhouseStoryGithubItemsMap) {
		for (const [storyId, story] of releaseNotesStoriesMap) {
			const label = story.labels.find((label) => label.name === versionLabel);

			if (label) {
				return label;
			}
		}

		throw new Error(`Could not find version label ${versionLabel}`);
	}
}
