import {getInput, setFailed, error as logError, info as logInfo} from '@actions/core';
import {context, getOctokit} from "@actions/github";
import {EventPayloads} from '@octokit/webhooks';
import replaceAsync = require("string-replace-async");
import {GitHub} from "@actions/github/lib/utils";
import {default as Clubhouse} from 'clubhouse-lib';
import {ReleaseNotesGenerator} from "./release-notes-generator";

class ReleaseNotesAction {
	private releaseNotesRegex = /\[rn > ([-._\w]*?)\]/;

	constructor(
		private githubApi: InstanceType<typeof GitHub>,
		private clubhouseApi: Clubhouse<any, any>,
		private repositoryOwner: string,
		private repository: string,
		private templates: { releasenotes: string, noStories: string }
	) {
	}

	public async run() {
		const payload = context.payload as EventPayloads.WebhookPayloadRelease;

		if (!payload || !payload.release || typeof payload.release.body !== "string") {
			throw new Error("No release body available. Unable to generate release notes");
		}

		const head = payload.release.tag_name;

		const replacedBody = await replaceAsync(payload.release.body, this.releaseNotesRegex,
			async (substring, base) => {
				try {
					const generator = new ReleaseNotesGenerator(
						this.githubApi,
						this.clubhouseApi,
						this.repositoryOwner,
						this.repository,
						head,
						base,
						this.templates
					);
					return await generator.generate();
				} catch (e) {
					logError(e);
					return substring;
				}
			}
		);

		logInfo(replacedBody);

		await this.githubApi.repos.updateRelease({
			owner: this.repositoryOwner,
			repo: this.repository,
			release_id: payload.release.id,
			body: replacedBody
		});

		logInfo("Update release notes to release");
	}
}

const action = new ReleaseNotesAction(
	getOctokit(getInput('github-token')),
	Clubhouse.create(getInput('clubhouse-token')),
	getInput("repository-owner"),
	getInput("repository-name"),
	{
		releasenotes: getInput("releasenotes-template"),
		noStories: getInput("no-stories-template")
	}
);

action.run().catch((error) => setFailed(error.message));
