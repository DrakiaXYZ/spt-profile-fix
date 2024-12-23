function main()
{
	const fileElement = document.getElementById('profileFile');
	fileElement.value = null;
	fileElement.addEventListener('change', handleFileSelect, false);

	const downloadButton = document.getElementById('downloadProfile');
	downloadButton.addEventListener('click', downloadProfile);

	const removeDuplicateCheckbox = document.getElementById('removeDuplicates');
	removeDuplicateCheckbox.addEventListener('change', refreshProfile);

	// Enable tooltips
	const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
	const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));

	// Clear the stored profile, sometimes it stays between page refreshes
	const profileHolder = document.getElementById('profileHolder');
	profileHolder.value = '';
}

function handleFileSelect(event)
{
	disableDownload();
	
	const file = event.target.files[0];
	if (!file)
	{
		return;
	}

	const reader = new FileReader();
	reader.addEventListener('load', () => {
		readerOnLoad(reader.result);
	}, false);
	reader.readAsText(file);
}

function readerOnLoad(content)
{
	// Store the profile data so we can process it on download
	const profileHolder = document.getElementById('profileHolder');
	profileHolder.value = content;
	if (!refreshProfile())
	{
		return;
	}

	enableDownload();
}

function refreshProfile()
{
	try {
		const profileHolder = document.getElementById('profileHolder');
		const profileJson = profileHolder.value;
		if (profileJson.length === 0)
		{
			return false;
		}
		const profile = JSON.parse(profileJson);

		// This is purely superfluous so we get any exceptions before the user hits Download
		fixProfile(profile);
	} catch (ex) {
		console.error('Error parsing profile');
		console.error(ex);
		return false;
	}

	return true;
}

function fixMagAmmo(profile)
{
	let madeChanges = false;
	const locationItems = {};

	// Loop through `characters.pmc.Inventory.items` and find any item with a numeric `location` property
	for (const item of profile.characters.pmc.Inventory.items)
	{
		// We only want to handle items that are in a "cartridges" slot
		if (item.slotId !== 'cartridges') continue;

		if (!locationItems[item.parentId])
		{
			locationItems[item.parentId] = [];
		}
		locationItems[item.parentId].push(item);
	}

	// Sort items by their location and fix any missing values
	for (const [_, items] of Object.entries(locationItems))
	{
		items.sort((a, b) => Number.parseInt(a.location ?? 0) > Number.parseInt(b.location ?? 0));

		for (const [index, item] of Object.entries(items))
		{
			const indexNum = Number.parseInt(index);

			if ((item.location ?? 0) !== indexNum)
			{
				console.log(`Updating index of ${item._id} in ${item.parentId} from ${item.location ?? 0} to ${indexNum}`);
				madeChanges = true;
			}

			// Only set the location if one was already set, or we're not setting it to 0 (Special handling for ammo boxes)
			if (item.location !== undefined || indexNum !== 0)
			{
				item.location = indexNum;
			}
		}
	}

	if (madeChanges)
	{
		addLogEntry('Fixed incorrect ammo in magazines');
	}
}

function fixBuilds(profile)
{
	let madeChanges = false;

	for (const [buildType, builds] of Object.entries(profile.userbuilds))
	{
		// Skip null builds
		if (!builds) continue;

		// First fix the capitalization
		for (const build of builds)
		{
			build.Id = build.Id || build.id;
			build.Name = build.Name || build.name;
			build.Root = build.Root || build.root;

			// biome-ignore lint/performance/noDelete: <explanation>
			delete build.id;
			// biome-ignore lint/performance/noDelete: <explanation>
			delete build.name;
			// biome-ignore lint/performance/noDelete: <explanation>
			delete build.root;
		}

		// Then look for duplicates, and keep the last one
		const buildIndexes = {};
		for (const [index, build] of Object.entries(builds).reverse())
		{
			if (buildIndexes[build.Id])
			{
				builds.splice(index, 1);
				console.log(`[${buildType}] '${build.Name}' (${build.Id}) already exists at ${buildIndexes[build.Id]}, deleting at ${index}`);
				madeChanges = true;
				continue;
			}

			buildIndexes[build.Id] = index;
		}
	}

	if (madeChanges)
	{
		addLogEntry('Fixed duplicate build entries');
	}
}

function fixBitcoin(profile)
{
	let madeChanges = false;
	const bitcoinProductionId = '5d5c205bd582a50d042a3c0e';
	const bitcoinProductionTime = 145000;

	// Try to find the bitcoin production
	const bitcoinProduction = profile?.characters?.pmc?.Hideout?.Production[bitcoinProductionId];
	if (!bitcoinProduction)
	{
		return;
	}

	// Reset the bitcoin production time to its default value
	if (bitcoinProduction.ProductionTime !== bitcoinProductionTime)
	{
		madeChanges = true;
		console.log(`Updating bitcoin production time from ${bitcoinProduction.ProductionTime} to ${bitcoinProductionTime}`);
		bitcoinProduction.ProductionTime = bitcoinProductionTime;
	}

	if (madeChanges)
	{
		addLogEntry('Fixed bitcoin production time');
	}
}

function fixProductionProgress(profile)
{
	let madeChanges = false;
	const productions = profile?.characters?.pmc?.Hideout?.Production;
	if (!productions)
	{
		return;
	}

	for (const production of Object.values(productions))
	{
		if (production.Progress === null)
		{
			madeChanges = true;
			console.log(`Setting production progress to 0 for ${production.RecipeId}`);
			production.Progress = 0;
		}
	}

	if (madeChanges)
	{
		addLogEntry('Fixed invalid production progress');
	}
}

function fixFleaRep(profile)
{
	let madeChanges = false;
	// Validate RagfairInfo exists at all, to avoid errors for partial profiles
	if (!profile?.characters?.pmc?.RagfairInfo)
	{
		return;
	}

	if (profile.characters.pmc.RagfairInfo.rating === null)
	{
		madeChanges = true;
		console.log('Ragfair rating is null, resetting to 0');
		profile.characters.pmc.RagfairInfo.rating = 0.0;
	}

	// Loop through all the offers, and check their profile ratings
	for (const offer of profile.characters.pmc.RagfairInfo.offers)
	{
		if (offer.user.rating === null)
		{
			madeChanges = true;
			console.log(`Ragfair offer ${offer._id} has null rating, setting to 0`);
			offer.user.rating = 0;
		}
	}

	if (madeChanges)
	{
		addLogEntry('Fixed incorrect flea rep data');
	}
}

function fixStashTemplate(profile)
{
	// Depending on the hideout stash level, set the stash _tpl
	const stashAreaType = 3;
	const stashTemplatesByAreaLevel = {
		1: '566abbc34bdc2d92178b4576',
		2: '5811ce572459770cba1a34ea',
		3: '5811ce662459770f6f490f32',
		4: '5811ce772459770e9e5f9532',
	}
	const stashItemId = profile.characters.pmc.Inventory.stash;
	const stashItem = profile.characters.pmc.Inventory.items.find(item => item._id === stashItemId);
	const stashArea = profile.characters.pmc.Hideout.Areas.find(area => area.type === stashAreaType);
	const stashAreaLevel = stashArea.level;
	let expectedStashTemplate = stashTemplatesByAreaLevel[stashAreaLevel];

	// Special case for Unheard profiles
	if (profile.info.edition === 'Unheard')
	{
		expectedStashTemplate = '6602bcf19cc643f44a04274b';
	}

	// If the stash template already matches, return
	if (stashItem._tpl === expectedStashTemplate)
	{
		return;
	}

	console.log(`Current stash template ${stashItem._tpl}, expected stash template: ${expectedStashTemplate}. Updating`);
	stashItem._tpl = expectedStashTemplate;

	addLogEntry('Fixed incorrect stash template');
}

function fixFavorites(profile)
{
	const inventory = profile.characters.pmc.Inventory;

	const correctedFavorites = inventory.favoriteItems.map(favorite => {
		return favorite._id ?? favorite;
	});

	if (JSON.stringify(correctedFavorites) != JSON.stringify(inventory.favoriteItems))
	{
		addLogEntry('Fixed incorrect profile favorites');
		inventory.favoriteItems = correctedFavorites;
	}
}

function fixTraderDialogAttachments(profile)
{
	const dialogs = profile.dialogues;
	let fixedDialogCount = 0;

	for (const traderDialog of Object.values(dialogs))
	{
		for (const message of traderDialog?.messages)
		{
			// Skip any messages without attached items
			if (!message.items?.data || !message.items?.stash)
			{
				continue;
			}

			// Skip any messages that don't have a stashId collision with the player's equipment ID
			if (message.items?.stash !== profile.characters?.pmc?.Inventory?.equipment)
			{
				continue;
			}

			// Otherwise we need to generate a new unique stash ID for this message's attachments
			message.items.stash = generateId();
			message.items.data = adoptOrphanedItems(message.items.stash, message.items.data);

			// Because `adoptOrphanedItems` sets the slotId to `hideout`, we need to re-set it to `main` to work with mail
			for (const item of message.items.data)
			{
				if (item.slotId === "hideout")
				{
					item.slotId = "main";
				}
			}

			fixedDialogCount++;
		}
	}

	if (fixedDialogCount > 0)
	{
		addLogEntry(`Fixed ${fixedDialogCount} invalid dialog attachments`);
	}
}

function fixDuplicateItems(profile, fixDuplicates)
{
	const inventory = profile.characters.pmc.Inventory;

	// First find all IDs that have duplicates
	const seenItems = new Set();
	const duplicateItemIndexes = new Set();
	for (let index = 0; index < inventory.items.length; index++)
	{
		const item = inventory.items[index];
		if (!seenItems.has(item._id))
		{
			seenItems.add(item._id);
			continue;
		}

		duplicateItemIndexes.add(index);
		console.log(`Found and removed duplicate item ID ${item._id}`);
	}

	if (duplicateItemIndexes.size > 0)
	{
		if (fixDuplicates)
		{
			// Now that we know the duplicate indexes, create a new array without those entries
			const fixedInventory = inventory.items.filter((_, index) => {return !duplicateItemIndexes.has(index)})
			inventory.items = fixedInventory;
			addLogEntry('Found and removed duplicate item(s)');
		}
		else
		{
			addLogEntry('Found duplicate item(s), please enable Remove Duplicate Items', false);
		}
	}
}

function fixProfile(profile)
{
	// Clear out any existing log
	const logContainer = document.getElementById('log');
	logContainer.innerText = '';
	const profileSptVersion = profile.spt.version;

	fixMagAmmo(profile);
	fixBuilds(profile);
	fixBitcoin(profile);
	fixProductionProgress(profile);
	fixFleaRep(profile);
	fixStashTemplate(profile);

	// Only run these for SPT 3.10
	if (profileSptVersion.includes('3.10'))
	{
		fixFavorites(profile);
		fixTraderDialogAttachments(profile);
	}

	// Pass in whether we should fix, or just report duplicates
	const fixDuplicates = document.getElementById('removeDuplicates').checked;
	fixDuplicateItems(profile, fixDuplicates);

	// If the log is still empty, show an "All Good" message
	if (logContainer.innerText === '')
	{
		addLogEntry('No profile issues detected!');
	}
}

function disableDownload()
{
	const buttons = [
		document.getElementById('downloadProfile'),
	];

	for (const button of buttons) {
		button.classList.add('disabled');
		button.classList.add('btn-outline-secondary');
		button.classList.remove('btn-primary');
		button.disabled = true;
	}
}

function enableDownload()
{
	const buttons = [
		document.getElementById('downloadProfile'),
	];

	for (const button of buttons) {
		button.classList.remove('disabled');
		button.classList.remove('btn-outline-secondary');
		button.classList.add('btn-primary');
		button.disabled = false;
	}
}

function downloadProfile()
{
	const profileHolder = document.getElementById('profileHolder');
	const profile = JSON.parse(profileHolder.value);
	fixProfile(profile);

	const fixedProfileJson = JSON.stringify(profile, null, '\t')
	triggerDownload(fixedProfileJson);
}

function triggerDownload(profileJson)
{
	const fileElement = document.getElementById('profileFile');
	const filename = fileElement.files[0].name;

	const hiddenElement = document.createElement('a');

	hiddenElement.href = `data:attachment/text,${encodeURIComponent(profileJson)}`;
	hiddenElement.target = '_blank';
	hiddenElement.download = filename;
	hiddenElement.click();
}

function addLogEntry(data, success = true)
{
	const fontColor = success ? 'green' : '#cc0000';
	const icon = success ? 'bi-check-circle' : 'bi-exclamation-circle';

	const logTemplate = `<div class="list-group-item d-flex gap-3 py-3">
  <i class="bi ${icon}" style="color: ${fontColor}; font-size: 1.2rem"></i>
  <div class="d-flex align-items-center gap-2 w-100 justify-content-between">
    <h6 class="mb-0">${data}</h6>
  </div>
</div>`;

	const logContainer = document.getElementById('log');
	logContainer.insertAdjacentHTML('beforeend', logTemplate);
}

function generateId()
{
    const timestamp = Math.floor(new Date().getTime() / 1000).toString(16);
	const leftover = 24 - timestamp.length;
    const objectId = timestamp + 'x'.repeat(leftover).replace(/[x]/g, () => {
        return Math.floor(Math.random() * 16).toString(16);
    }).toLowerCase();

	return objectId;
}

function adoptOrphanedItems(rootId, items)
{
	for (const item of items)
	{
		// Check if the item's parent exists.
		const parentExists = items.some((parentItem) => parentItem._id === item.parentId);

		// If the parent does not exist and the item is not already a 'hideout' item, adopt the orphaned item by
		// setting the parent ID to the PMCs inventory equipment ID, the slot ID to 'hideout', and remove the location.
		if (!parentExists && item.parentId !== rootId && item.slotId !== "hideout")
		{
			item.parentId = rootId;
			item.slotId = "hideout";
			delete item.location;
		}
	}

	return items;
}

(()=> {main();})();