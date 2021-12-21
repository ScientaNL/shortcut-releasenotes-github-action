import { error as logError, getInput, info as logInfo, setFailed } from '@actions/core';
import { context, getOctokit } from "@actions/github";
import { GitHub } from '@actions/github/lib/utils';
import { ReleaseReleasedEvent } from '@octokit/webhooks-types';
import { ShortcutClient } from "@useshortcut/client";
import { default as replaceAsync } from 'string-replace-async';
import { ReleaseNotesGenerator } from "./release-notes-generator";

// Shortcut's types depend on the DOM :(
declare global {
	type File = any;
}

class ReleaseNotesAction {
	private releaseNotesRegex = /\[rn > ([-._\w]*?)\]/;

	constructor(
		private githubApi: InstanceType<typeof GitHub>,
		private shortcutApi: ShortcutClient<any>,
		private repositoryOwner: string,
		private repository: string,
		private templates: { releasenotes: string, noStories: string },
	) {
	}

	public async run() {
		const payload = context.payload as ReleaseReleasedEvent;

		if (!payload || !payload.release || typeof payload.release.body !== "string") {
			throw new Error("No release body available. Unable to generate release notes");
		}

		const head = payload.release.tag_name;

		const replacedBody = await replaceAsync(payload.release.body, this.releaseNotesRegex,
			async (substring, base) => {
				try {
					const generator = new ReleaseNotesGenerator(
						this.githubApi,
						this.shortcutApi,
						this.repositoryOwner,
						this.repository,
						head,
						base,
						this.templates,
					);
					return await generator.generate();
				} catch (e) {
					logError(e);
					if (e.response && e.response.url) {
						logError(e.response?.url);
					}
					setFailed(e);
					return substring;
				}
			},
		);

		logInfo('Replaced body:' + replacedBody);

		try {
			await this.githubApi.rest.repos.updateRelease({
				owner: this.repositoryOwner,
				repo: this.repository,
				release_id: payload.release.id,
				body: replacedBody,
			});
		} catch (e) {
			logError(e);
			throw new Error('Failed to update release');
		}

		logInfo("Update release notes to release");
	}
}

const action = new ReleaseNotesAction(
	getOctokit(getInput('github-token')),
	new ShortcutClient(getInput('clubhouse-token')),
	getInput("repository-owner"),
	getInput("repository-name"),
	{
		releasenotes: getInput("releasenotes-template"),
		noStories: getInput("no-stories-template"),
	},
);

action.run().catch((error) => {
	logError('Action failed.');
	setFailed(error.message);
});
