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
	const locationItems = {};
	const profile = JSON.parse(content);

	// Loop through `characters.pmc.Inventory.items` and find any item with a numeric `location` property
	for (const item of profile.characters.pmc.Inventory.items)
	{
		if (isNaN(item.location)) continue;

		if (!locationItems[item.parentId])
		{
			locationItems[item.parentId] = [];
		}
		locationItems[item.parentId].push(item);
	}

	// Sort items by their location and fix any missing values
	for (const [_, items] of Object.entries(locationItems))
	{
		items.sort((a, b) => a.location > b.location);

		for (const [index, item] of Object.entries(items))
		{
			if (item.location != index)
			{
				console.log(`Updating index of ${item._id} in ${item.parentId} from ${item.location} to ${index}`);
			}
			item.location = parseInt(index);
		}
	}

	// Create our download element and enable the download button
	const profileHolder = document.getElementById('profileHolder');
	profileHolder.value = JSON.stringify(profile, null, '\t');
	enableDownload();
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

	var hiddenElement = document.createElement('a');

	hiddenElement.href = 'data:attachment/text,' + encodeURIComponent(profileJson);
	hiddenElement.target = '_blank';
	hiddenElement.download = filename;
	hiddenElement.click();
	document.removeChild(hiddenElement);
}

(function(){main();})();