/**
 * Initializes EOS OSC module
 */
function init() {
	script.log("Initializing EOS OSC");

	// Register pattern for cmdLine
	local.register("/eos/out/cmd", "cmdLineCallback");

	// Register pattern with Wildcards for cuelist and cue number
	local.register("/eos/out/*/cue/*/*", "cueCallback");
	local.register("/eos/out/pending/cue", "cueCallback");

	// Register pattern with Wildcards for cueText
	local.register("/eos/out/*/cue/text", "cueTextCallback");

	// Send Initial OSC
	updateUser();
	local.send("/eos/subscribe", 1);

	script.log("EOS OSC Ready!");
}

/**
 * Handles updated parameters and sends user update if applicable
 *
 * @param {Object} param The parameter that was changed
 */
function moduleParameterChanged(param) {
	script.log(param.name + " parameter changed, new value: " + param.get());

	if (param.name == "user" ||
		param.name == "userID" ||
		param.name == "localPort" ||
		param.name == "local" ||
		param.name == "remoteHost" ||
		param.name == "remotePort") {
		updateUser();
	}
}

// Sending & Command Formulation
/**
 * Sends and terminates a command to Eos
 *
 * @param {string} command The command to send
 * @param {boolean} [terminate=false] Whether to terminate the command line after new command
 * @param {boolean} [clear=false] Whether to clear command line before new command
 */
function sendCommand(command, terminate, clear) {
	if (terminate) { //Terminate if true or no terminate variable provided
		command = command+"#";
	}

	if (clear) {
		script.log("New Command: " + command);
		local.send("/eos/newcmd", command);
	} else {
		script.log("Command: " + command);
		local.send("/eos/cmd", command);
	}
}

/**
 * Sends user selection to Eos
 */
function updateUser() {
	var userID = local.parameters.userID.get();

	if (local.parameters.user.get() == "console") {
		userID = -1;
	} else if (local.parameters.user.get() == "background") {
		userID = 0;
	}

	local.send("/eos/user", userID);

	script.log("Change Eos User: " + userID);
}

/**
 * Create an Eos message to specify the input target
 *
 * @param target {string} Target type: "one" "all" "range"
 * @param [id] {int} Target "one" id
 * @param [startID] {int} Target "range" start id
 * @param [endID] {int} Target "range" end id
 *
 * @returns {string} Eos channel selection command
 */
function getCommandTarget(target, id, startID, endID) {
	var globalStart = local.parameters.startChannel.get();
	if (target == "one") return "Chan "+(globalStart+id);
	if (target == "range") return "Chan "+(globalStart+startID)+" Thru "+(globalStart+endID);
	if (target == "all") return "Select_All";
}

// Universal Commands
/**
 * Send command to fire macro
 *
 * @param {int} macroNumber The number of the macro to fire (1-99,999)
 */
function macroCallback(macroNumber) {
	script.log("Macro: " + macroNumber);

	local.send("/eos/macro/fire", macroNumber);
}

// Channel Control Commands
/**
 * Send command to set target to value
 *
 * @param target {string} Target type: "one" "all" "range"
 * @param id {int} Target "one" id
 * @param startID {int} Target "range" start id
 * @param endID {int} Target "range" end id
 * @param value {number} Value 0.0-1.0
 */
function valueCallback(target, id, startID, endID, value) {
	var v = Math.round(value * 100);
	v = normalizeEosSingleDigit(v);

	var targetCmd = getCommandTarget(target, id, startID, endID);

	script.log("Value [" + v + "]: " + targetCmd);

	sendCommand(targetCmd+" @ "+v, true, true);
}

/**
 * Send command to set target to color
 *
 * @param target {string} Target type: "one" "all" "range"
 * @param id {int} Target "one" id
 * @param startID {int} Target "range" start id
 * @param endID {int} Target "range" end id
 * @param color {[red: number, green: number, blue: number]} Color array (values 0.0-1.0)
 */
function colorCallback(target, id, startID, endID, color) {
	var targetCmd = getCommandTarget(target, id, startID, endID);

	script.log("Color [" + color[0] + ", " + color[1] + ", " + color[2] + "]: " + targetCmd);

	sendCommand(targetCmd, true, true);
	local.send("/eos/color/rgb", color[0], color[1], color[2]);
}

/**
 * Send command to set target value and color to 0
 *
 * @param target {string} Target type: "one" "all" "range"
 * @param id {int} Target "one" id
 * @param startID {int} Target "range" start id
 * @param endID {int} Target "range" end id
 */
function blackOutCallback(target, id, startID, endID) {
	var targetCmd = getCommandTarget(target, id, startID, endID);

	script.log("Blackout: " + targetCmd);

	sendCommand(targetCmd+" Color 0", true, true);
	sendCommand(targetCmd+" @ Out", true, true);
}

// Advanced Commands
/**
 * Send command to set target range to color gradient
 *
 * @param startID {int} Target range start id
 * @param endID {int} Target range start id
 * @param color1 {[red: number, green: number, blue: number]} Gradient start color array (values 0.0-1.0)
 * @param color2 {[red: number, green: number, blue: number]} Gradient end color array (values 0.0-1.0)
 */
function gradientCallback(startID, endID, color1, color2) {
	script.log("Gradient: Chan " + startID + " Thru " + endID);

	if (startID == endID) {
		colorCallback("one",startID,0,0,color1);
		return;
	}
	var r1 = color1[0];
	var g1 = color1[1];
	var b1 = color1[2];

	var r2 = color2[0];
	var g2 = color2[1];
	var b2 = color2[2];

	var minID = Math.min(startID, endID);
	var maxID = Math.max(startID, endID);

	for (var i = minID; i <= maxID; i++) {
		var p = parseFloat(i-minID) / (maxID-minID); //Percent of all targets

		var r = (r1+(r2-r1)*p);
		var g = (g1+(g2-g1)*p);
		var b = (b1+(b2-b1)*p);

		colorCallback("one", i, undefined, undefined, [r,g,b]);
	}
}

/**
 * Send command to set target range to a pointed gradient
 *
 * @param startID {int} Target range start id
 * @param endID {int} Target range start id
 * @param position {number} Where the point should be centered (0.0-1.0)
 * @param size {number} The size of the point in either direction (0.0-1.0)
 * @param fade {number} Amount to fade target to target (0.0-1.0)
 * @param value {number} Value 0.0-1.0
 */
function pointCallback(startID, endID, position, size, fade, value) {
	script.log("Point: Chan " + startID + " Thru " + endID);

	for (var i = startID; i <= endID; i++) {
		var p = parseFloat(i-startID) / (endID-startID); //Percent of all targets

		if (Math.abs(position-p) < size) { //If distance from center position is less than size
			var fac = (position-p) * fade * 3;
			fac = 1 - Math.abs(fac / size);
			fac = Math.min(Math.max(fac,0),1);

			valueCallback("one", i, undefined, undefined, value * fac);
		} else {
			valueCallback("one", i, undefined, undefined, 0);
		}
	}
}

// OSC Receive Callbacks
/**
 * Parse Eos command line output and set module values
 *
 * @param address {string} OSC address
 * @param args {string} OSC arguments
 */
function cmdLineCallback(address, args) {
	// Check if address pattern matches command line
	if (local.match(address, "/eos/out/cmd")) {
		local.values.commandLine.set(args[0]);

		script.log("Command Line: \"" + args[0] + "\"");
	}
}

/**
 * Parse Eos active/pending cue number output and set module values
 *
 * @param address {string} OSC address
 * @param args {string} OSC arguments
 */
function cueCallback(address, args) {
	// Check if address pattern matches cue numbers
	if (local.match(address, "/eos/out/*/cue/*/*") || local.match(address, "/eos/out/pending/cue")) {
		// Split in parts
		var addressParts = address.split("/");

		// The type is part 4 (index 3) for output "/eos/out/<active-pending>/cue/<list>/<cue>"
		var cueType = addressParts[3];

		var cuelist = 0;
		var cueNumber = 0.0;

		// Check if address pattern matches cue numbers
		if (local.match(address, "/eos/out/*/cue/*/*")) {
			// The cuelist is part 6 (index 5) for output "/eos/out/<active-pending>/cue/<list>/<cue>"
			cuelist = parseInt(addressParts[5]);

			// The cue number is part 7 (index 6) for output "/eos/out/<active-pending>/cue/<list>/<cue>"
			cueNumber = parseFloat(addressParts[6]);
		}

		// Output the received values
		if (cueType == "active") {
			local.values.activeCueNo.set(cueNumber);
			local.values.activeCuelistNo.set(cuelist);

			script.log("Active Cue - List: " + cuelist + ", Cue: " + cueNumber);
		} else if (cueType == "pending") {
			local.values.pendingCueNo.set(cueNumber);
			local.values.pendingCuelistNo.set(cuelist);

			script.log("Pending Cue - List: " + cuelist + ", Cue: " + cueNumber);
		}
	}
}

/**
 * Parse Eos active/pending cue text output and set module values
 *
 * @param address {string} OSC address
 * @param args {string} OSC arguments
 */
function cueTextCallback(address, args) {
	// Check if address pattern matches
	if (local.match(address, "/eos/out/*/cue/text")) {
		// Split in parts
		var addressParts = address.split("/");

		// The type is part 4 (index 3) for output "/eos/out/<active-pending>/cue/text"
		var cueType = addressParts[3];

		// Parse cue parameters
		var cueText = args[0].split(" ");

		var cueLabel = "";
		var cueTime = 0;
		var cuePercent = 0;

		if (cueType == "active") {
			if (cueText.length > 0) {
				// The cue time is the 2nd-to-last part (index length-2) for output "1/2.3 Label With Spaces 0:05 75%"
				cueTime = eosTimeToSeconds(cueText[cueText.length - 2]);

				// The cue percent is the last part (index length-1) for output "1/2.3 Label With Spaces 0:05 75%"
				cuePercent = parseInt(cueText[cueText.length - 1]);

				// The cue label is from part 2 (index 1) to the 3rd-to-last part (index length-3) for output "1/2.3 Label With Spaces 0:05 75%"
				cueText.splice(0, 1);
				cueText.splice(cueText.length - 2, 2);
				cueLabel = cueText.join(" ");
			}

			script.log("Parse Active Cue - Label: " + cueLabel + ", Time: " + cueTime + ", Percent: " + cuePercent);

			// Output the active cue text
			local.values.activeCueName.set(args[0]);

			// Output the active cue parameters
			local.values.activeCueLabel.set(cueLabel);
			local.values.activeCueTime.set(cueTime);
			local.values.activeCuePercent.set(cuePercent);

		} else if (cueType == "pending") {
			if (cueText.length > 0) {
				// The cue time is the last part (index length-1) for output "1/2.3 Label With Spaces 0:05"
				cueTime = eosTimeToSeconds(cueText[cueText.length - 1]);

				// The cue label is from part 2 (index 1) to the 2nd-to-last part (index length-2) for output "1/2.3 Label With Spaces 0:05 75%"
				cueText.splice(0, 1);
				cueText.splice(cueText.length - 1, 1);
				cueLabel = cueText.join(" ");
			}

			script.log("Parse Pending Cue - Label: " + cueLabel + ", Time: " + cueTime);

			// Output the pending cue text
			local.values.pendingCueName.set(args[0]);

			// Output the pending cue parameters
			local.values.pendingCueLabel.set(cueLabel);
			local.values.pendingCueTime.set(cueTime);
		}
	}
}

// Utilities
/**
 * Add leading 0 to single digit numbers
 *
 * @param value {number} The number to normalize
 *
 * @returns {string} The normalized number
 */
function normalizeEosSingleDigit(value) {
	if (value > 0 && value < 10) {
		return "0" + value;
	}
	return value;
}

/**
 * Convert Eos time string to float seconds
 *
 * @param time {string} The string time to convert
 *
 * @returns {number} The time in seconds
 */
function eosTimeToSeconds(time) {
	var timeParts = time.split(':');

	// Seconds
	var seconds = parseFloat(time);

	// Minutes:Seconds
	if (timeParts.length == 2) {
		seconds = parseInt(timeParts[0]) * 60;
		seconds = seconds + parseFloat(timeParts[1]);

	// Hours:Minutes:Seconds
	} else if (timeParts.length == 3) {
		seconds = parseInt(timeParts[0]) * 60 * 60;
		seconds = seconds + parseInt(timeParts[1]) * 60;
		seconds = seconds + parseFloat(timeParts[2]);
	}

	return seconds;
}
