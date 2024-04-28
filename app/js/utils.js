function isNumeric(n) {
	return !isNaN(parseFloat(n)) && isFinite(n);
}

function toBoolean(value) {
	return isNumeric(value) ? !/^0$/i.test(value) : /^true$/i.test(value);
}

/**
 * This function takes a string parameter property that represents the property by which the array of objects will be sorted.
 * The function returns another function that will be used to sort the array of objects.
 *
 * If the property starts with a hyphen (-), the function will sort the array in descending order.
 * Otherwise, it will sort in ascending order.
 *
 * @param property The name of the property to sort by. Use a minus sign prefix to sort in descending order.
 * @returns `Function` A function that can be passed to the sort() method of an array to sort it by the specified property.
 * @example
 *
 * ```javascript
 *   myArray = [
 *     {name: 'A', age: 18, univerty: 'lorem ipsum dolor sit amet'}
 *     {name: 'C', age: 22, univerty: 'lorem ipsum dolor sit amet'}
 *     {name: 'B', age: 16, univerty: 'lorem ipsum dolor sit amet'}
 *   ]
 *   myArray.sort(Helper.dynamicSort('age'));  // Sorts ascending by age
 *   myArray.sort(Helper.dynamicSort('-age')); // Sorts descending by age
 * ```
 */
function dynamicSort(property) {
	var sortOrder = 1;

	if (property[0] === "-") {
		sortOrder = -1;
		property = property.substr(1);
	}

	return function (a, b) {
		if (sortOrder == -1) {
			return b[property].localeCompare(a[property]);
		} else {
			return a[property].localeCompare(b[property]);
		}
	};
}

/**
 * Pads a number with leading zeros to match the number of digits in a given maximum value.
 *
 * @param num The number to be padded with leading zeros.
 * @param max The maximum value for which the number of digits will be used to determine the padding length
 *
 * @returns `string` the input number padded with leading zeros to match the number of digits in the maximum value.
 *
 * @example
 * ```js
 * console.log(zeroPad(2, 9)); // "2"
 * console.log(zeroPad(2, 10)); // "02"
 * ```
 */
function zeroPad(num, max) {
	return num.toString().padStart(Math.floor(Math.log10(max) + 1), "0");
}

/**
 * Generates a string name based on the given index with or without leading zero, count, name, separatorIndex and optional path.
 *
 * @param {number} index – The index of the sequence.
 * @param {number} count – The total count of the sequence.
 * @param {string} name – The name of the string.
 * @param {string} [separatorIndex='. '] - The separator index used between the index and the name.
 * @param {string|null} [path=null] – The optional path to the sequence.
 * @return {object} An object containing the generated name and full path of the sequence.
 */
function getSequenceName(index, count, name, separatorIndex = ". ", path = null) {
	const sanitizedName = sanitize(name); //, { replacement: (s) => "? ".indexOf(s) > -1 ? "" : "-", }).trim();

	const indexName = `${index}${separatorIndex}${sanitizedName}`;
	const indexPath = path ? `${path}/${indexName}` : indexName;

	const sequence = zeroPad(index, count);
	const sequenceName = `${sequence}${separatorIndex}${sanitizedName}`;
	const sequencePath = path ? `${path}/${sequenceName}` : sequenceName;

	if (indexPath === sequencePath) {
		return {name: indexName, fullPath: indexPath};
	} else {
        if (Settings.download().seqZeroLeft) {
            // if it exists then rename it with leading zero
			if (fs.existsSync(indexPath)) {
				fs.renameSync(indexPath, sequencePath);
			}

			return {name: sequenceName, fullPath: sequencePath};
        } else {
            // if it exists then rename it without leading zero
			if (fs.existsSync(sequencePath)) {
				fs.renameSync(sequencePath, indexPath);
			}

			return {name: indexName, fullPath: indexPath};
		}
	}
}

/**
 * Calculates the download speed given the input speed in kilobytes per second.
 *
 * @param {number} bytes - The download speed in kilobytes per second.
 * @return {Object} The download speed value and unit.
 */
function getDownloadSpeed(bytes) {
	const BYTES_PER_KB = 1024;
	const UNITS = ["B/s", "KB/s", "MB/s", "GB/s"];

	let speed = Math.floor(bytes);
    let unitIndex = 0;

    if (speed >= BYTES_PER_KB) {
        unitIndex = speed >= BYTES_PER_KB ** 3 ? 3 : speed >= BYTES_PER_KB ** 2 ? 2 : 1;
        speed /= BYTES_PER_KB ** unitIndex;
    }

	return {
		value: Number(speed.toFixed(2)),
		unit: UNITS[unitIndex],
	};
}

function paginate(array, page_size, page_number) {
	// human-readable page numbers usually start with 1, so we reduce 1 in the first argument
	return array.slice((page_number - 1) * page_size, page_number * page_size);
}