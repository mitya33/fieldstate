/* =================
| FIELD-STATE - minimise your DOM logic.
| @author: Andy Croxall (www.mitya.uk)
| @documentation: http://mitya.uk/projects/field-state/
================= */

let fs = (function() {

	let done_radios_hack,

		//cache for elements whose fieldState attributes should be taken from another element (data-fieldState="as:selector")
		as_cache = {},

		//callbacks container for callback-contingent expressions
		callbacks = {},
	
		//container for default unavail/unreq states
		default_states = {};
	

	/* ------------
	| MAIN - called initially on DOM ready to sweep over whole DOM. Can also be called with two args:
	| 	@els 			- element reference or selector pointing to the fields to look at
	| 	@context 		- element or selector pointing to the container to look within (useful only when @els is a selector)
	| 	@add_callback 	- applicable only when called by fs.addEventListener. A callback to fire when a field's state changes| 	changes			- is 
	|	@is_reset		- is from API's reset() method
	|	@is_initialise	- is from API's initialise() method
	------------ */
	
	function main(els, context, add_callback, is_reset, is_initialise) {

		/* ---
		| PREP
		--- */
	
		let
	
		//gather up fields
		fields = !els || typeof els == 'string' ? get_context(context).querySelectorAll(!els ? '*' : els) : els,
	
		//RegEx for matching expressions
		regex = /if:\(('[^']+'|"[^"]+") ?([!=]=|>|<|~)? ?('[^']+'|"[^"]+"|!?\/[^\/]+\/|callback:(.+)|:((any|none|all|\d+[+\-]?)_)?checked)\)/;

		//radios - because no change event fires on radio deselect, reinitialise FS whenever a radio is selected
		if (!done_radios_hack) {
			let radios = document.querySelectorAll('input[type=radio]');
			if (radios.length)
				radios.forEach(el => { el.addEventListener('change', () => main(), false); });
			done_radios_hack = true;
		}
		
		//iterate over fields
		
		let checker_func;
		(fields.length ? fields : [fields]).forEach(checker_func = field => {

			//ignore if field is not actually a field
			//if (!/input|select|textarea/i.test(field.tagName)) return;

			//log starting val and if not done already
			if (field.getAttribute('start_val') === null) field.setAttribute('start_val', field.value);			
			
			//if reset, remove tracking class and reset to starting val
			if (is_reset) {
				field.className = field.className.replace(/fs-(hidden|disabled)/, '');
				field.value = field.getAttribute('start_val');
			}
			
			/* ---
			| cache - take fieldState config from another element? (see comment above cache)
			--- */
	
			if (field.getAttribute('data-fieldState')) {
	
				//selector to find element to take data from
				let selector = field.getAttribute('data-fieldState').replace(/^as:/, ''), cache_item = as_cache[selector];
	
				//have we taken data from this element before? Should be in the cache, if so. No...
				if (!cache_item) {
					as_cache[selector] = {};
					let other_field = document.querySelector(selector);
					if (other_field) {
						field.getAttribute('data-req') = as_cache[selector].req = other_field.getAttribute('data-req');
						field.getAttribute('data-avail') = as_cache[selector].avail = other_field.getAttribute('data-avail');
						field.getAttribute('data-unreq-state') = as_cache[selector].unreqState = other_field.getAttribute('data-unreq-state');
						field.getAttribute('data-unavail-state') = as_cache[selector].unavailState = other_field.getAttribute('data-unavail-state');
					}
	
				//...yes...
				} else {
					field.getAttribute('data-req') = cache_item.req;
					field.getAttribute('data-avail') = cache_item.avail;
					field.getAttribute('data-unreq-state') = cache_item.unreqState;
					field.getAttribute('data-unavail-state') = cache_item.unavailState;
				}
			}

	
			/* ---
			| field is required/available?
			--- */

			//this field's required/available attr's
			let attrs = {req: field.getAttribute('data-req'), avail: field.getAttribute('data-avail')}, parts, iteration_func;
	
			['req', 'avail'].forEach(iteration_func = which => {
				if (attrs[which]) {

					let parts = attrs[which].match(regex);
					
					//always
					if (/^(true|false)$/.test(field.getAttribute('data-'+which)))
						toggle_field_state(field, which, field.getAttribute('data-'+which) == 'true');
	
					//conditionally...
					else if (parts) {
	
						//...prep cond parts
						let
						contingent_fields = document.querySelectorAll(parts[1].replace(/^["']|(\[\])?["']$/g, '')),
						operator = parts[2],
						comparison = parts[3].replace(/^["']|["']$/g, ''),
						callback = parts[4];
	
						//...resolve and act
						toggle_field_state(field, which, eval_expression.call(field, contingent_fields, operator, comparison, callback));
	
						//...on future changes to contingent fields, reevaluate this field's field state
						//Event is ignored if user has manually toggled field state (see documentation)

						if (!field.forms_listener_added) {
							field.forms_listener_added = true;
							contingent_fields.forEach(con_field => {
								let evt_name = /checkbox|radio/.test(con_field.type) || con_field.tagName == 'SELECT' ? 'change' : 'keyup';
								con_field.addEventListener(
									evt_name,
									con_field.change_callback = function(evt) { if (!field.stopListening) checker_func(field); }
								);
							});
						}

					}
	
				}
	
			});
			
			//finally, add event listener for when this field's state changes?
			if (add_callback) field.onFieldChange = add_callback;
	
		});
	
	}


	/* ------------
	| UTILS
	------------ */

	/* ---
	| visibly toggle field required/available state
	--- */

	function toggle_field_state(field, req_or_avail, yes_or_no) {

		//prep
		let new_state;

		//find corresponding label
		let label = field;
		while(label && label.tagName != "LABEL") label = label.previousSibling;

		//act on parent container too?
		let and_cntr = field.hasAttribute('data-and-cntr') && field.getAttribute('data-and-cntr') !== 'false';

		//if toggling req state, update label
		if (req_or_avail == 'req' && label)
			yes_or_no ? (!/<span>\*<\/span>/i.test(label.innerHTML) ? label.innerHTML += ' <span>*</span>' : '') : label.innerHTML = label.innerHTML.replace(/<span>\*<\/span>/i, '');

		//update field state. Also add/remove HTML5 required state as required...

		//...make available or required...
		if (yes_or_no) {
			field.style.display = 'inline-block';
			field.disabled = false;
			field.className = field.className.replace('fs-disabled', '');
			new_state = req_or_avail == 'req' ? 'required' : 'available';
			if (label) { label.style.display = 'inline'; label.className = label.className.replace('fs-disabled', ''); }
			if (and_cntr) field.parentNode.style.display = 'block';

		//...make not available or required (condition stops one overwriting the other where a field can be in either state at different times)
		} else if ((field.className.indexOf('fs-required') == -1 && req_or_avail == 'avail') || (field.className.indexOf('fs-available') == -1 && req_or_avail == 'req')) {
			let not_state = field.getAttribute('data-un'+req_or_avail+'-state') || default_states['un'+req_or_avail];
			if (not_state == 'hidden') {
				new_state = 'hidden';
				field.style.display = 'none';
				if (label) label.style.display = 'none';
				if (and_cntr) field.parentNode.style.display = 'none';
			} else if (not_state == 'disabled') {
				new_state = 'disabled';
				field.disabled = true;
				if (field.type == 'text' || field.type == 'password' || field.tagName == 'TEXTAREA') field.value = '';
				if (field.className.indexOf('fs-disabled') == -1) field.className += ' fs-disabled';
				if (label && label.className.indexOf('fs-disabled') == -1) label.className += ' fs-disabled';
			}
			
		}
		
		//toggle HTML5 required attribute as required
		field[(new_state != 'required' ? 'remove' : 'set')+'Attribute']('required', true);

		//log current state as class
		if (new_state) field.className = field.className.replace(/fs\-\w+/, '')+' fs-'+new_state;

		//dispatch change event for field so any knock-on effects of this field becoming un/available can happen
		if (field.type != 'submit' && field.tagName != 'BUTTON') dispatch_evt(field);
		
		//callback to notify? Pass along field, label and new field state. See addEventListener() comments.
		if (field.onFieldChange) field.onFieldChange(field, label, new_state);

	}


	/* ---
	| eval expression
	--- */

	function eval_expression(contingent_fields, operator, comparison, callback) {

		//get current value of field(s) denoted in selector. If is multi-select, will be array, not string...

		let curr_val = '', curr_val_arr = [], contingent_field_is_unavail_or_disabled;
		contingent_fields.forEach(field => {
			if (/fs-(hidden|disabled)/.test(field.className)) { contingent_field_is_unavail_or_disabled = true; return; }

			//...get this field's current value - how depends on type...

			//...non-select field
			let val;
			if (field.tagName != 'SELECT')
				val = !/^(checkbox|radio)$/.test(field.type) ? field.value : field.checked;

			//...multi-select dropdowns (get array of values)
			else if (field.hasAttribute('multiple'))
				val = [].map.call(field.selectedOptions, function(option) { return option.value; });

			//...pick-one dropdowns
			else
				val = field.options[field.options.selectedIndex].value;

			curr_val += val;
			if (!(val instanceof Array)) curr_val_arr.push(val); else val.forEach(val => curr_val_arr.push(val));
		});
		
		//exist at this point and return false if the contingent field is currently disabled or hidden. In either state we ignore its value
		if (contingent_field_is_unavail_or_disabled) return false;

		//in case we're checking against checked state rather than value, get list of CFs' check states as sequence of 0s and 1s
		let checked_states;
		if (comparison.charAt(0) == ':') {
			checked_states = '';
			contingent_fields.forEach(field => checked_states += field.checked ? 1 : 0);
		}

		//evaluate and return bool denoting result...

		//...check against value (simple)

		if (!/^[:\/!]|callback:/.test(comparison) && operator != '~')
			switch (operator) {
				case '==': 	return curr_val == comparison;
				case '!=': 	return curr_val != comparison;
				case '>': 	return curr_val > comparison;
				case '<': 	return curr_val < comparison;
			}

		//...check for given value in multi-select
		else if (operator == '~')
			return curr_val_arr.indexOf(comparison) != -1;

		//...check against value (REGEX)
		else if (/^!?\/.+\/$/.test(comparison)) {
			let regex = new RegExp(comparison.replace(/^!?\/|\/$/g, ''));
			return comparison[0] != '!' ? regex.test(curr_val) : !regex.test(curr_val);

		//...check against value (user-defined callback)
		} else if (callback && typeof callbacks[callback] == 'function') {
			return callbacks[callback].call(this, contingent_fields, curr_val_arr);

		//...check against checked state (except for stipulations that N should be checked)

		} else if (/:((all|any|none)_)?checked/.test(comparison)) {
			switch (comparison) {
				case ':all_checked': case ':checked':	return checked_states && checked_states.indexOf('0') == -1;
				case ':any_checked':					return checked_states.indexOf('1') != -1;
				case ':none_checked': 					return checked_states.indexOf('1') == -1;
			}

		//...check that N checkboxes are checked

		} else if (/:\d+[+\-]?_checked/.test(comparison)) {
			let parts = comparison.match(/^:(\d+)([+\-]?)/), checked_num = checked_states.split('1').length - 1;
			if (!parts[2])
				return checked_num == parseInt(parts[1]);
			else if (parts[2] == '+')
				return checked_num >= parseInt(parts[1]);
			else if (parts[2] == '-')
				return checked_num <= parseInt(parts[1]);
		}

	}
	

	/* ------------
	| BITS
	------------ */

	//init on DOM-ready
	document.addEventListener('DOMContentLoaded', function() { main(); });
	
	//event dispatcher
	function dispatch_evt(el) {
		let evt_name = /checkbox|radio/.test(el.type) || el.tagName == 'SELECT' ? 'change' : 'keyup';
		if ("createEvent" in document) {
		    let evt = document.createEvent("HTMLEvents");
		    evt.initEvent(evt_name, false, true);
		    el.dispatchEvent(evt);
		} else
		    el.fireEvent("on"+evt_name, evt);
	}
	
	//resolve context (as selector or DOM object)
	function get_context(context) { return !context ? document : (typeof context == 'string' ? document.querySelector(context) : context); }


	/* ------------
	| EXPORT global API
	------------ */

	return {

		//Re/initialise FS, either on whole DOM (no arg) or on specific elements
		initialise: function(sel_or_el, context) { main(sel_or_el, context); },

		//callback expressions - add callback to callbacks container and reinitialise affected element(s)
		addCallback: function(id, callback) {
			if (typeof id == 'string' && typeof callback == 'function') {
				callbacks[id] = callback;
				main('[data-req*="callback:'+id+'"], [data-avail*="callback:'+id+'"]');
			}
		},

		//manual toggle field state (to or from its revert state) - not recommended, but allowed. After doing this, FS will no longer
		//update the field in response to any changes to contingent fields. See documentation.

		toggle: function(field, direction) {
			if (typeof field == 'string') field = document.querySelector(field);
			if (!field) return;
			let which = field.getAttribute('data-req') ? 'req' : (field.getAttribute('data-avail') ? 'avail' : null);
			if (!which) return;
			field.stopListening = true;
			toggle_field_state(field, which, direction);
		},
		
		//add event listeners for changes to a field. Expects 2 args: selector or element, and callback. Callback is passed 2 args:
		//field element, label element (if any) and new state (either 'required', 'available', 'hidden' or 'disabled')
		onFieldStateChange: function(sel_or_el, callback) {
			if (sel_or_el && typeof callback == 'function') main(sel_or_el, null, callback);
		},
		
		//set default unreq/unavail states ('disabled', 'hidden')
		setDefaultState: function(which, state) {
			which ? default_states['un'+which] = state : (function() { default_states['unreq'] = state; default_states['unavail'] = state; })();
			main();
		},
	
		//reset fields to original state
		reset: function(sel_or_el, context) { main(sel_or_el, context, null, true); },
		
		//set field value
		setFieldValue: function(sel_or_el, val, context) {
			let el = typeof sel_or_el == 'string' ? get_context(context).querySelector(sel_or_el) : sel_or_el;
			if (el) {
				el.value = val;
				dispatch_evt(el);
			}
		}

	}

	
})();