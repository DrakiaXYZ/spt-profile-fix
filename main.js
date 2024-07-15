function main()
{
	const fileElement = document.getElementById('profileFile');
	fileElement.value = null;
	fileElement.addEventListener('change', handleFileSelect, false);
	
	const downloadButton = document.getElementById('downloadProfile');
	downloadButton.addEventListener('click', downloadProfile);
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
	reader.addEventListener("load", () => {
		readerOnLoad(reader.result);
	}, false);
	reader.readAsText(file);
}

function readerOnLoad(content)
{
	const profile = JSON.parse(content);

	fixMagAmmo(profile);
	fixBuilds(profile);
	fixBitcoin(profile);
	fixProductionProgress(profile);
	fixFleaRep(profile);

	// Create our download element and enable the download button
	const profileHolder = document.getElementById('profileHolder');
	profileHolder.value = JSON.stringify(profile, null, '\t');
	enableDownload();
}

function fixMagAmmo(profile)
{
	const locationItems = {};

	// Loop through `characters.pmc.Inventory.items` and find any item with a numeric `location` property
	for (const item of profile.characters.pmc.Inventory.items)
	{
		// We only want to handle items that are in a "cartridges" slot
		if (item.slotId !== "cartridges") continue;

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
			}

			// Only set the location if one was already set, or we're not setting it to 0 (Special handling for ammo boxes)
			if (item.location !== undefined || indexNum !== 0)
			{
				item.location = indexNum;
			}
		}
	}
}

function fixBuilds(profile)
{
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
				continue;
			}

			buildIndexes[build.Id] = index;
		}
	}
}

function fixBitcoin(profile)
{
	const bitcoinProductionId = "5d5c205bd582a50d042a3c0e";
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
		console.log(`Updating bitcoin production time from ${bitcoinProduction.ProductionTime} to ${bitcoinProductionTime}`);
		bitcoinProduction.ProductionTime = bitcoinProductionTime;
	}
}

function fixProductionProgress(profile)
{
	const productions = profile?.characters?.pmc?.Hideout?.Production;
	if (!productions)
	{
		return;
	}

	for (const production of Object.values(productions))
	{
		if (production.Progress === null)
		{
			console.log(`Setting production progress to 0 for ${production.RecipeId}`);
			production.Progress = 0;
		}
	}
}

function fixFleaRep(profile)
{
	// Validate RagfairInfo exists at all, to avoid errors for partial profiles
	if (!profile?.characters?.pmc?.RagfairInfo)
	{
		return;
	}
	const rating = profile.characters.pmc.RagfairInfo.rating;

	if (rating === undefined || rating === null)
	{
		console.log('Ragfair rating is null, resetting to 0');
		profile.characters.pmc.RagfairInfo.rating = 0.0;
	}
}

function disableDownload()
{
	const downloadButton = document.getElementById('downloadProfile');
	downloadButton.classList.add('disabled');
	downloadButton.classList.add('btn-outline-secondary');
	downloadButton.classList.remove('btn-primary');
	downloadButton.disabled = true;
}

function enableDownload()
{
	const downloadButton = document.getElementById('downloadProfile');
	downloadButton.classList.remove('disabled');
	downloadButton.classList.remove('btn-outline-secondary');
	downloadButton.classList.add('btn-primary');
	downloadButton.disabled = false;
}

function downloadProfile()
{
	const profileHolder = document.getElementById('profileHolder');
	const profileJson = profileHolder.value;

	const fileElement = document.getElementById('profileFile');
	const filename = fileElement.files[0].name;

	const hiddenElement = document.createElement('a');

	hiddenElement.href = `data:attachment/text,${encodeURIComponent(profileJson)}`;
	hiddenElement.target = '_blank';
	hiddenElement.download = filename;
	hiddenElement.click();
}

(()=> {main();})();