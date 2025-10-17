import { debug, env, window } from 'vscode';
import { CONFIG_KEYS, CURSOR_IMAGE_KEY, DEBUG_IMAGE_KEY, FAKE_EMPTY, IDLE_IMAGE_KEY, REPLACE_KEYS, VSCODE_IMAGE_KEY, VSCODE_INSIDERS_IMAGE_KEY } from './constants';
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

// Return the activity text based on editor state
async function details(idling: CONFIG_KEYS): Promise<string> {
	if (!window.activeTextEditor) {
		// Idle
		return getConfig()[idling] as string;
	}

	if (debug.activeDebugSession) {
		return 'Debugging Code';
	}

	// Editing
	return 'Playing Code';
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
		details: removeDetails ? undefined : await details(CONFIG_KEYS.DetailsIdling),
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

	// Optional repository button
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

	// Show file icon and language info if editing
	if (window.activeTextEditor) {
		const largeImageKey = resolveFileIcon(window.activeTextEditor.document);
		const largeImageText = (config[CONFIG_KEYS.LargeImage] as string)
			.replace(REPLACE_KEYS.LanguageLowerCase, toLower(largeImageKey))
			.replace(REPLACE_KEYS.LanguageTitleCase, toTitle(largeImageKey))
			.replace(REPLACE_KEYS.LanguageUpperCase, toUpper(largeImageKey))
			.padEnd(2, FAKE_EMPTY);

		state.state = removeLowerDetails ? undefined : await details(CONFIG_KEYS.LowerDetailsIdling);

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
