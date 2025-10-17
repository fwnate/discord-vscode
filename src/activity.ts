import { basename, parse, sep } from 'node:path';
import type { Selection, TextDocument } from 'vscode';
import { debug, env, window, workspace } from 'vscode';
import {
	CONFIG_KEYS,
	CURSOR_IMAGE_KEY,
	DEBUG_IMAGE_KEY,
	EMPTY,
	FAKE_EMPTY,
	FILE_SIZES,
	IDLE_IMAGE_KEY,
	REPLACE_KEYS,
	UNKNOWN_GIT_BRANCH,
	UNKNOWN_GIT_REPO_NAME,
	VSCODE_IMAGE_KEY,
	VSCODE_INSIDERS_IMAGE_KEY,
} from './constants';
import { log, LogLevel } from './logger';
import { getConfig, getGit, resolveFileIcon, toLower, toTitle, toUpper } from './util';

interface ActivityPayload {
	buttons?: { label: string; url: string }[];
	details?: string;
	instance?: boolean;
	joinSecret?: string;
	largeImageKey?: string;
	largeImageText?: string;
	matchSecret?: string;
	partyId?: string;
	partyMax?: number;
	partySize?: number;
	smallImageKey?: string;
	smallImageText?: string;
	spectateSecret?: string;
	startTimestamp?: number;
	state?: string;
	type?: number;
}

async function fileDetails(_raw: string, document: TextDocument, selection: Selection): Promise<string> {
	let raw = _raw.slice();

	if (raw.includes(REPLACE_KEYS.TotalLines)) {
		raw = raw.replace(REPLACE_KEYS.TotalLines, document.lineCount.toLocaleString());
	}

	if (raw.includes(REPLACE_KEYS.CurrentLine)) {
		raw = raw.replace(REPLACE_KEYS.CurrentLine, (selection.active.line + 1).toLocaleString());
	}

	if (raw.includes(REPLACE_KEYS.CurrentColumn)) {
		raw = raw.replace(REPLACE_KEYS.CurrentColumn, (selection.active.character + 1).toLocaleString());
	}

	if (raw.includes(REPLACE_KEYS.FileSize)) {
		let currentDivision = 0;
		let size: number;
		try {
			({ size } = await workspace.fs.stat(document.uri));
		} catch {
			size = document.getText().length;
		}

		const originalSize = size;
		if (originalSize > 1000) {
			size /= 1000;
			currentDivision++;
			while (size > 1000) {
				currentDivision++;
				size /= 1000;
			}
		}

		raw = raw.replace(
			REPLACE_KEYS.FileSize,
			`${originalSize > 1000 ? size.toFixed(2) : size}${FILE_SIZES[currentDivision]}`
		);
	}

	const git = await getGit();

	if (raw.includes(REPLACE_KEYS.GitBranch)) {
		raw = raw.replace(
			REPLACE_KEYS.GitBranch,
			git?.repositories.find((repo) => repo.ui.selected)?.state.HEAD?.name ?? UNKNOWN_GIT_BRANCH
		);
	}

	if (raw.includes(REPLACE_KEYS.GitRepoName)) {
		raw = raw.replace(
			REPLACE_KEYS.GitRepoName,
			git?.repositories
				.find((repo) => repo.ui.selected)
				?.state.remotes[0]?.fetchUrl?.split('/')[1]
				?.replace('.git', '') ?? UNKNOWN_GIT_REPO_NAME
		);
	}

	return raw;
}

async function details(idling: CONFIG_KEYS, editing: CONFIG_KEYS, debugging: CONFIG_KEYS): Promise<string> {
	if (!window.activeTextEditor) {
		// Idle
		return getConfig()[idling] as string;
	}

	if (debug.activeDebugSession) {
		return "Debugging Code";
	}

	// Editing
	return "Playing Code";
}

export async function activity(previous: ActivityPayload = {}): Promise<ActivityPayload> {
	const config = getConfig();
	const swapBigAndSmallImage = config[CONFIG_KEYS.SwapBigAndSmallImage];
	const appName = env.appName;

	const defaultSmallImageKey = debug.activeDebugSession
		? DEBUG_IMAGE_KEY
		: appName.includes('Cursor')
			? CURSOR_IMAGE_KEY
			: appName.includes('Insiders')
				? VSCODE_INSIDERS_IMAGE_KEY
				: VSCODE_IMAGE_KEY;

	const defaultSmallImageText = (config[CONFIG_KEYS.SmallImage] as string).replace(REPLACE_KEYS.AppName, appName);
	const defaultLargeImageText = config[CONFIG_KEYS.LargeImageIdling] as string;
	const removeDetails = config[CONFIG_KEYS.RemoveDetails] as boolean;
	const removeLowerDetails = config[CONFIG_KEYS.RemoveLowerDetails] as boolean;
	const removeRemoteRepository = config[CONFIG_KEYS.RemoveRemoteRepository] as boolean;

	const git = await getGit();

	let state: ActivityPayload = {
		type: 0,
		details: removeDetails ? undefined : await details(CONFIG_KEYS.DetailsIdling, CONFIG_KEYS.DetailsEditing, CONFIG_KEYS.DetailsDebugging),
		startTimestamp: config[CONFIG_KEYS.RemoveTimestamp] ? undefined : (previous.startTimestamp ?? Date.now()),
		largeImageKey: IDLE_IMAGE_KEY,
		largeImageText: defaultLargeImageText,
		smallImageKey: defaultSmallImageKey,
		smallImageText: defaultSmallImageText,
	};

	if (swapBigAndSmallImage) {
		state = {
			...state,
			largeImageKey: defaultSmallImageKey,
			largeImageText: defaultSmallImageText,
			smallImageKey: IDLE_IMAGE_KEY,
			smallImageText: defaultLargeImageText,
		};
	}

	// Repository button
	if (!removeRemoteRepository && git?.repositories.length) {
		let repo = git.repositories.find((repo) => repo.ui.selected)?.state.remotes[0]?.fetchUrl;
		if (repo) {
			if (repo.startsWith('git@') || repo.startsWith('ssh://')) {
				repo = repo.replace('ssh://', '').replace(':', '/').replace('git@', 'https://').replace('.git', '');
			} else {
				repo = repo.replace(/(https:\/\/)([^@]*)@(.*?$)/, '$1$3').replace('.git', '');
			}
			state.buttons = [{ label: 'View Repository', url: repo }];
		}
	}

	// File icon & language
	if (window.activeTextEditor) {
		const largeImageKey = resolveFileIcon(window.activeTextEditor.document);
		const largeImageText = (config[CONFIG_KEYS.LargeImage] as string)
			.replace(REPLACE_KEYS.LanguageLowerCase, toLower(largeImageKey))
			.replace(REPLACE_KEYS.LanguageTitleCase, toTitle(largeImageKey))
			.replace(REPLACE_KEYS.LanguageUpperCase, toUpper(largeImageKey))
			.padEnd(2, FAKE_EMPTY);

		state.state = removeLowerDetails ? undefined : await details(CONFIG_KEYS.LowerDetailsIdling, CONFIG_KEYS.LowerDetailsEditing, CONFIG_KEYS.LowerDetailsDebugging);

		if (swapBigAndSmallImage) {
			state.smallImageKey = largeImageKey;
			state.smallImageText = largeImageText;
		} else {
			state.largeImageKey = largeImageKey;
			state.largeImageText = largeImageText;
		}

		log(LogLevel.Trace, `VSCode language id: ${window.activeTextEditor.document.languageId}`);
	}

	return state;
}
