function compileSB3(json, assets = {}, settings = {}){
  //Default settings
  settings.minify ??= true;
  settings.unsafeFloor ??= true;
  settings.accurateTrig ??= true;
  settings.precompute ??= true;
  settings.username ??= "";

  //Different variable types
  const TYPE_INT = 0;
  const TYPE_FLOAT = 1;
  const TYPE_BOOLEAN = 2;
  const TYPE_STRING = 3;
  const TYPE_ANY = 4;

  //For things like addition, where it's unknown whether or not the result will be a float
  //Updated at compile time
  const TYPE_NUMBER = 5;

  //When you can accept strings or integers, but not anything else. Default conversion to ints.
  const TYPE_INTSTR = 6;

  const TYPE_UNDEFINED = -1;

  //Variable things to keep track of
  const varIDs = [];
  const varNames = {};
  let varTypes = {};
  let varID = 0;

  //Argument things to keep track of
  let argNames = [];
  let argIds = [];
  let argTypes = [];
  let argIdxs = {};

  //Custom block things to keep track of
  let customIDs = [];
  let customBlocks = [];
  let commentBlocks = [];
  let customCalls = [];
  let sprite = 0;

  function toBool(val){
    return !!(+val) || (!isNum(val) && val != false && val != "false");
  }

  //Generate a unique ID given some number
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ$_";
  const charNums = chars + "0123456789";
  function generateID(id){
    let res = "";
    while(id >= chars.length){
      res = charNums[id % charNums.length] + res;
      id = Math.floor(id / charNums.length);
    }
    return chars[id] + res;
  }


  //Figure out if a "not" function can be optimized by adding up what can and can't be
  function canOptNot(val){
    switch(val[1]){
      case undefined:
      case null:
      case "operator_not":
        return 1;
      
      case "operator_equals":
      case "operator_neq":
      case "operator_lt":
      case "operator_leq":
      case "operator_gt":
      case "operator_geq":
        return 0;
        
      case "operator_and":
      case "operator_or":
        return canOptNot(val[2][0]) + canOptNot(val[2][1]);

      default:
        return -1;
    }
  }

  //Is a value a number?
  function isNum(val){
    if(isNaN(+val))
      return false;

    return typeof val === "number" || (typeof val === "string" && val.trim().length > 0);
  }

  //Optimize a "not" block (e.g. not<not<x> and not<y>> -> <x> or <y>)
  function optNot(val){
    switch(val[1]){
      //For when values are left empty
      case undefined:
        return [TYPE_BOOLEAN, null, true];

      case "operator_equals":
        val[1] = "operator_neq";
        return val;

      case "operator_neq":
        val[1] = "operator_equals";
        return val;

      case "operator_lt":
        val[1] = "operator_geq";
        return val;

      case "operator_leq":
        val[1] = "operator_gt";
        return val;

      case "operator_gt":
        val[1] = "operator_leq";
        return val;

      case "operator_geq":
        val[1] = "operator_lt";
        return val;

      case "operator_not":
        return val[2][0];
      
      case "operator_and":
      case "operator_or": {
        //Only optimize this if it's cheaper to than not to
        if(canOptNot(val[2][0]) + canOptNot(val[2][1]) > 0){
          val[1] = (val[1] === "operator_and" ? "operator_or" : "operator_and");
          val[2][0] = optNot(val[2][0]);
          val[2][1] = optNot(val[2][1]);

          return val;
        }
      }

      default:
        //Optimize constants if they somehow exist
        if(val[1] === null && settings.precompute)
          return [TYPE_BOOLEAN, null, !toBool(val[2])];
        
        return [TYPE_BOOLEAN, "operator_not", [val]];
    }
  }

  let forceYield = false;
  function generateIR(blocks){
    let res = {};

    function generateExpr(block){
      switch(block.opcode){
        //Argument values
        case "argument_reporter_boolean":
          //If the argument doesn't exist for the function
          if(!(block.fields.VALUE[0] in argIdxs)){
            //Might as well do this -- Detect if the code is compiled
            if(block.fields.VALUE[0] === "is compiled?"){
              return [
                TYPE_BOOLEAN,
                null,
                true
              ];
            } else {
              //Otherwise, default to... 0 instead of a boolean?
              return [
                TYPE_INT,
                null,
                0
              ];
            }
          }

          return [
            TYPE_BOOLEAN,
            block.opcode,
            [],
            block.fields.VALUE[0]
          ];

        case "argument_reporter_string_number":
          if(!(block.fields.VALUE[0] in argIdxs)){
            //Default unused arguments to 0
            return [
              TYPE_INT,
              null,
              0
            ];
          }

          return [
            //Would have been nice
            // argTypes[block.fields.VALUE[0]] == "%n" ? TYPE_NUMBER : TYPE_ANY,
            TYPE_ANY,
            block.opcode,
            [],
            block.fields.VALUE[0]
          ];
        
        //Motion blocks
        case "motion_goto_menu":
          return [
            TYPE_STRING,
            null,
            block.fields.TO[0]
          ];

        case "motion_pointtowards_menu":
          return [
            TYPE_STRING,
            null,
            block.fields.TOWARDS[0]
          ];


        //Control blocks
        case "control_get_counter":
          return [
            TYPE_INT,
            block.opcode,
            []
          ];

        case "control_create_clone_of_menu":
          return [
            TYPE_STRING,
            null,
            block.fields.CLONE_OPTION[0]
          ];

        //Looks blocks
        case "looks_size":
          return [
            TYPE_INT,
            block.opcode,
            []
          ];

        case "looks_costumenumbername":
          return [
            TYPE_STRING,
            null,
            block.fields.NUMBER_NAME[0]
          ];

        case "looks_backdropnumbername":
          return [
            TYPE_STRING,
            null,
            block.fields.NUMBER_NAME[0]
          ];

        case "looks_costume":
          return [
            TYPE_STRING,
            null,
            block.fields.COSTUME[0]
          ];

        case "looks_backdrops":
          return [
            TYPE_STRING,
            null,
            block.fields.BACKDROP[0]
          ];


        //Sound blocks
        case "sound_volume":
          return [
            TYPE_NUMBER,
            block.opcode,
            []
          ];

        case "sound_sounds_menu":
          return [
            TYPE_STRING,
            null,
            block.fields.SOUND_MENU[0]
          ];

        //Sensing blocks
        case "sensing_of":
          //TODO: Impliment
          //Default to 0
/*
          return [
            TYPE_ANY,
            block.opcode,
            [],
            generateVal(block.inputs.KEY_OPTION, TYPE_INTSTR)
          ];
          break;
*/
          return [
            TYPE_STRING,
            null,
            0
          ];

        case "sensing_dayssince2000":
          return [
            TYPE_INT,
            block.opcode,
            []
          ];

        case "sensing_keyoptions":
          return [
            TYPE_STRING,
            null,
            block.fields.KEY_OPTION[0]
          ];

        case "sensing_keypressed":
          return [
            TYPE_BOOLEAN,
            block.opcode,
            [],
            generateVal(block.inputs.KEY_OPTION, TYPE_INTSTR)
          ];

        case "sensing_mousex":
        case "sensing_mousey":
          return [
            TYPE_INT,
            block.opcode,
            []
          ];

        case "sensing_mousedown":
          return [
            TYPE_BOOLEAN,
            block.opcode,
            []
          ];

        case "sensing_answer":
          return [
            TYPE_STRING,
            block.opcode,
            []
          ];

        case "sensing_timer":
          return [
            TYPE_NUMBER,
            block.opcode,
            []
          ];

        case "sensing_username":
          return [
            TYPE_STRING,
            null,
            settings.username.toString()
          ];

        case "sensing_current":
          return [
            TYPE_INT,
            block.opcode,
            block.fields.CURRENTMENU[0]
          ];
        
        //Pen menus
        case "pen_menu_colorParam":
          return [
            TYPE_STRING,
            null,
            block.fields.colorParam[0]
          ];

        //List operations
        case "data_itemoflist": {
          const idx = generateVal(block.inputs.INDEX, TYPE_INTSTR, 1);

          //Check if the value will always be a string that doesn't have special purpose
          if(idx[1] === null && (isNum(idx[2]) || !["last", "random", "any"].includes(idx[2].toString().toLowerCase())) && (+idx[2] < 1 || !isNum(idx[2]) || (settings.unsafeFloor && +idx[2] > 4294967296)) && settings.precompute){
            return [
              TYPE_STRING,
              null,
              ""
            ];
          } else {
            return [
              TYPE_ANY,
              block.opcode,
              [
                generateVal(block.inputs.INDEX, TYPE_INTSTR, 1)
              ],
              block.fields.LIST
            ];
          }
        }

        case "data_itemnumoflist":
          return [
            TYPE_INT,
            block.opcode,
            [
              generateVal(block.inputs.ITEM)
            ],
            block.fields.LIST
          ];

        case "data_lengthoflist":
          return [
            TYPE_INT,
            block.opcode,
            [
            ],
            block.fields.LIST
          ];

        case "data_listcontainsitem":
          return [
            TYPE_BOOLEAN,
            block.opcode,
            [
              generateVal(block.inputs.ITEM)
            ],
            block.fields.LIST
          ];
        

        //Motion blocks
        case "motion_xposition":
        case "motion_yposition":
        case "motion_direction": {
          if(sprite === 0){
            //The stage has determined values for these that
            //cannt be changed
            return [
              TYPE_INT,
              null,
              block.opcode === "motion_direction" ? 90 : 0
            ];
          } else {
            return [
              TYPE_NUMBER,
              block.opcode,
              []
            ];
          }
        }


        //Boolean operators
        case "operator_equals":
        case "operator_gt": //GT and LT both accept any types D: (though type *can* be optimized!)
        case "operator_lt": {
          let left = generateVal(block.inputs.OPERAND1);
          let right = generateVal(block.inputs.OPERAND2);

          if(left[1] === null && right[1] === null && settings.precompute){
            switch(block.opcode){
              case "operator_equals":
                return [
                  TYPE_BOOLEAN,
                  null,
                  (
                    !isNum(left[2]) || !isNum(right[2]) ?
                    left[2].toString().toLowerCase() == right[2].toString().toLowerCase() :
                    +left[2] == +right[2]
                  )
                ];

              case "operator_gt":
                return [
                  TYPE_BOOLEAN,
                  null,
                  (
                    !isNum(left[2]) || !isNum(right[2]) ?
                    left[2].toString().toLowerCase() > right[2].toString().toLowerCase() :
                    +left[2] > +right[2]
                  )
                ];

              case "operator_lt":
                return [
                  TYPE_BOOLEAN,
                  null,
                    (
                    !isNum(left[2]) || !isNum(right[2])
                    ? left[2].toString().toLowerCase() < right[2].toString().toLowerCase() :
                    +left[2] < +right[2]
                    )
                ];
            }
          }

          //When you can infer types
          //Comparing numbers is faster than comparing strings
          if(
            left[1] === null &&
            isNum(left[2])
          ){
            //This looks so ugly -- Consider putting else on different lines
            left = generateVal(block.inputs.OPERAND1, TYPE_NUMBER);
          } else if(
            right[1] === null &&
            isNum(right[2])
          ){
            right = generateVal(block.inputs.OPERAND2, TYPE_NUMBER);
          } else if(
            (
              left[1] === null &&
              !isNum(left[2])
            ) ||
            (
              right[1] === null &&
              !isNum(right[2])
            )
          ){
            console.log(left);
            console.log(right);
            left = generateVal(block.inputs.OPERAND1, TYPE_STRING);
            right = generateVal(block.inputs.OPERAND2, TYPE_STRING);
          }

          return [
            TYPE_BOOLEAN,
            block.opcode,
            [
              left,
              right
            ]
          ];
        }

        case "operator_and":
        case "operator_or": {
          const left = generateVal(block.inputs.OPERAND1, TYPE_BOOLEAN, false);
          const right = generateVal(block.inputs.OPERAND2, TYPE_BOOLEAN, false);

          if(left[1] === null && right[1] === null && settings.precompute){
            if(block.opcode === "operator_and"){
              return [
                TYPE_BOOLEAN,
                null,
                left[2] && right[2]
              ];
            } else {
              return [
                TYPE_BOOLEAN,
                null,
                left[2] || right[2]
              ];
            }
          }

          return [
            TYPE_BOOLEAN,
            block.opcode,
            [
              left,
              right
            ]
          ];
        }

        case "operator_not": {
          const op = generateVal(block.inputs.OPERAND, TYPE_BOOLEAN, false);

          //optNot is perfect for this situation -- Optimizing not blocks
          return optNot(op);
        }


        //Numeric operators
        case "operator_add":
        case "operator_subtract":
        case "operator_multiply":
        {
          const left = generateVal(block.inputs.NUM1, TYPE_NUMBER);
          const right = generateVal(block.inputs.NUM2, TYPE_NUMBER);

          if(left[1] === null && right[1] === null && settings.precompute){
            let res = 0;

            switch(block.opcode){
              case "operator_add":
                res = left[2] + right[2];
                break;

              case "operator_subtract":
                res = left[2] - right[2];
                break;

              case "operator_multiply":
                res = left[2] * right[2];
                break;
            }

            //Return the correct type for further optimizations
            return [
              isNaN(res) ? TYPE_FLOAT : (res % 1 ? TYPE_NUMBER : TYPE_INT),
              null,
              res
            ];
          }

          //Precompute common cases of just number conversions
          if(
            left[1] === null &&
            (
              (
                block.opcode === "operator_add" &&
                left[2] == 0
              ) ||
              (
                block.opcode === "operator_multiply" &&
                left[2] == 1
              )
            ) &&
            settings.precompute
          )
            return right;

          if(
            right[1] === null &&
            (
              (
                block.opcode !== "operator_add" &&
                right[2] == 0
              ) ||
              (
                block.opcode !== "operator_subtract" &&
                right[2] == 0
              ) ||
              (
                block.opcode === "operator_multiply" &&
                right[2] == 1
              )
            ) &&
            settings.precompute
          )
            return left;

          //Can't do because of Infinity * 0
          //Left in for future knowledge of variable values
/*
          if(
            block.opcode === "operator_multiply" &&
            (
              (
                left[1] === null &&
                left[2] === 0
              ) ||
              (
                right[1] === null &&
                right[2] === 0
              )
            )
          ){
            return [
              TYPE_INT,
              null,
              0
            ];
          }
*/

          //The final resulting type, for optimizations
          let type = TYPE_FLOAT;
          if(
            //Multiplication can only generate NaN when one of its parameters are 0
            (
              block.opcode === "operator_multiply" &&
              (
                left[1] === null &&
                left[2] !== 0
              ) ||
              (
                right[1] === null &&
                right[2] !== 0
              )
            ) ||

            //In all cases though, NaN can only be generated when one of the parameters are +/-Infinity
            (
              left[1] === null &&
              Math.abs(left[2]) !== Infinity
            ) ||
            (
              right[1] === null &&
              Math.abs(right[2]) !== Infinity
            )
          ){
            type = TYPE_NUMBER;

            //Handle integers as well, of course
            if(
              left[0] === TYPE_INT &&
              right[0] === TYPE_INT
            )
              type = TYPE_INT;
          }

          //Multiplication by -1 changed to normal negation
          if(
            block.opcode === "operator_multiply" &&
            (
              left[1] === null &&
              left[2] === -1
            ) &&
            settings.precompute
          ){
            return [
              right[0] === TYPE_FLOAT ? TYPE_NUMBER : right[0],
              "operator_subtract",
              [
                [
                  TYPE_INT,
                  null,
                  0
                ],
                right
              ]
            ];
          }

          if(
            block.opcode === "operator_multiply" &&
            (
              right[1] === null &&
              right[2] === -1
            ) &&
            settings.precompute
          ){
            return [
              left[0] === TYPE_FLOAT ? TYPE_NUMBER : left[0],
              "operator_subtract",
              [
                [
                  TYPE_INT,
                  null,
                  0
                ],
                left
              ]
            ];
          }


          return [
            type,
            block.opcode,
            [
              left,
              right
            ]
          ];
        }

        case "operator_random": {
          let left = generateVal(block.inputs.FROM);
          let right = generateVal(block.inputs.TO);

          //Funny cases
          if(
            (
              left[1] === null &&
              left[2] == Infinity
            ) ||
            (
              right[1] === null &&
              right[2] == Infinity
            )
          ){
            return [
              TYPE_INT,
              null,
              Infinity
            ];
          }

          if(
            (
              left[1] === null &&
              left[2] == -Infinity
            ) ||
            (
              right[1] === null &&
              right[2] == -Infinity
            )
          ){
            return [
              TYPE_FLOAT,
              null,
              NaN
            ];
          }

          //Try to figure out which random pattern
          let num = false; //If the result won't be floored
          let type = TYPE_NUMBER;
          if(
            left[0] === TYPE_INT &&
            right[0] === TYPE_INT
          )
            type = TYPE_INT;

          //How to know if a number isn't an integer :)
          if(
            (
              left[1] === null &&
              left[2].toString().includes(".")
            ) ||
            (
              right[1] === null &&
              right[2].toString().includes(".")
            )
          ){
            type = TYPE_NUMBER;
            left = generateVal(block.inputs.FROM, TYPE_NUMBER);
            right = generateVal(block.inputs.TO, TYPE_NUMBER);
            num = true;
          }

          return [
            type,
            block.opcode,
            [
              left,
              right
            ],
            num
          ];
        }

        case "operator_divide":
        case "operator_mod": //x % 0, +/-Infinity % x :(
        {
          const left = generateVal(block.inputs.NUM1, TYPE_NUMBER);
          const right = generateVal(block.inputs.NUM2, TYPE_NUMBER);

          if(left[1] === null && right[1] === null && settings.precompute){
            let res = 0;

            switch(block.opcode){
              case "operator_divide":
                res = left[2] / right[2];
                break;

              case "operator_mod": {
                res = ((left[2] % right[2]) + right[2]) % right[2];
                if(Math.abs(right[2]) === Infinity && Math.abs(left[2]) !== Infinity)
                  res = left[2];
                break;
              }
            }
            return [
              isNaN(res) ? TYPE_FLOAT : (res % 1 ? TYPE_NUMBER : TYPE_INT),
              null,
              res
            ];
          }


           let type = TYPE_FLOAT;

/*
          // NaN prevents this optimization from being used
          // Left in for future variable value knowledge
          if(block.opcode === "operator_mod" && right[1] === null && Math.abs(right[2]) == Infinity && settings.precompute)
            return left;
*/

          
          if(
            (
              block.opcode === "operator_divide" &&
              //If either operators aren't 0 and either operators aren't +/-Infinity, safe from NaN
              (
                (
                  (
                    left[1] === null &&
                    left[2] !== 0
                  ) ||
                  (
                    right[1] === null &&
                    right[2] !== 0
                  )
                ) &&
                (
                  (
                    left[1] === null &&
                    Math.abs(left[2]) !== Infinity
                  ) ||
                  (
                    right[1] === null &&
                    Math.abs(right[2]) !== Infinity
                  )
                )
              )
            )
            //TODO: Optimize modulo when there's further value knowledge
          )
            type = TYPE_NUMBER;

          //Dividing by -1 turns into normal negation
          if(
            block.opcode === "operator_divide" &&
            right[1] === null &&
            right[2] == -1 &&
            settings.precompute
          ){
            return [
              left[0],
              "operator_subtract",
              [
                [
                  TYPE_INT,
                  null,
                  0
                ],
                left
              ]
            ];
          }

          //Dividing by 1 returns itself
          if(block.opcode === "operator_divide" && right[1] === null && right[2] == 1 && settings.precompute)
            return left;

          return [
            type,
            block.opcode,
            [
              left,
              right
            ]
          ];
        }

        case "operator_round": {
          const num = generateVal(block.inputs.NUM, TYPE_NUMBER, 0);

          if(num[1] === null && settings.precompute){
            return [
              TYPE_INT,
              null,
              Math.round(num[2])
            ];
          }

          return [
            TYPE_INT,
            block.opcode,
            [
              num
            ]
          ];
        }

        case "operator_mathop": {
          let num = generateVal(block.inputs.NUM, TYPE_NUMBER);

          if(num[1] === null && settings.precompute){
            let res = 0;
            num = num[2];

            switch(block.fields.OPERATOR[0]){
              case "abs":
                res = Math.abs(num);
                break;

              case "ln":
                res = Math.log(num);
                break;

              case "log":
                res = Math.log10(num);
                break;

              case "asin":
                res = 57.29577951308232 * Math.asin(num);
                break;

              case "acos":
                res = 57.29577951308232 * Math.acos(num);
                break;

              case "atan":
                res = 57.29577951308232 * Math.atan(num);
                break;

              case "sqrt":
                res = Math.sqrt(num);
                break;

              case "e ^":
                res = Math.exp(num);
                break;

              case "10 ^":
                res = Math.pow(10, num);
                break;

              case "sin":
                if(settings.accurateTrig)
                  res = Math.round(1e10 * Math.sin(0.017453292519943295 * num)) / 1e10;
                else
                  res = Math.sin(0.017453292519943295 * num);
                break;

              case "cos":
                if(settings.accurateTrig)
                  res = Math.round(1e10 * Math.cos(0.017453292519943295 * num)) / 1e10;
                else
                  res = Math.cos(0.017453292519943295 * num);
                break;

              case "tan":
                //Very fun complience
                if(settings.accurateTrig){
                  res = Math.round(1e10 * Math.tan(0.017453292519943295 * num)) / 1e10;

                  if(Math.abs(res) === 16331239353195368) //Different :p
                    res = Math.sign(res) * Infinity;
                } else {
                  res = Math.tan(0.017453292519943295 * num);

                  if(Math.abs(res) === 16331239353195370)
                    res = Math.sign(res) * Infinity;
                }
                break;

              case "floor":
                res = Math.floor(num);
                break;

              case "ceiling":
                res = Math.ceil(num);
                break;

              default:
                console.log(JSON.stringify(block, null, 2));
                throw new Error(`Failed to generate IR: Unknown math operator block '${block.fields.OPERATOR[0]}'`);
            }

            return [
              isNaN(res) ? TYPE_FLOAT : (res % 1 ? TYPE_NUMBER : TYPE_INT),
              null,
              res
            ];
          }

          switch(block.fields.OPERATOR[0]){
            //Can take integer inputs, returns float outputs
            case "ln":
            case "log":

            case "asin":
            case "acos":
            case "atan":

            case "sin": // *Why can so many things result in NaN*
            case "cos":
            case "tan":

            case "sqrt":
              return [
                TYPE_FLOAT,
                block.opcode + "_" + block.fields.OPERATOR[0],
                [
                  num
                ]
              ];

            case "abs": //Much nicer blocks that can't return NaN
            case "e ^":
            case "10 ^":

              return [
                TYPE_NUMBER,
                block.opcode + "_" + block.fields.OPERATOR[0],
                [
                  num
                ]
              ];

            case "floor": //Even nicer blocks that can only return integers
            case "ceiling":
              return [
                TYPE_INT,
                block.opcode + "_" + block.fields.OPERATOR[0],
                [
                  num
                ]
              ];

            default:
              console.log(JSON.stringify(block, null, 2));
              throw new Error(`Failed to generate IR: Unknown math operator block '${block.fields.OPERATOR[0]}'`);
          }
        }


        //String operators
        case "operator_join": {
          let left = generateVal(block.inputs.STRING1, TYPE_ANY);
          const right = generateVal(block.inputs.STRING2, TYPE_ANY);

          //Only one operand has to be a string in JS for addition to concatinate
          if(left[0] !== TYPE_STRING && right[0] !== TYPE_STRING)
            left = generateVal(block.inputs.STRING1, TYPE_STRING);

          if(left[1] === null && right[1] === null && settings.precompute){
            return [
              TYPE_STRING,
              null,
              left[2] + right[2]
            ];
          }

          return [
            TYPE_STRING,
            block.opcode,
            [
              left,
              right
            ]
          ];
        }

        case "operator_length": {
          const str = generateVal(block.inputs.STRING, TYPE_STRING);

          if(str[1] === null && settings.precompute){
            return [
              TYPE_INT,
              null,
              str[2].length
            ];
          }

          return [
            TYPE_INT,
            block.opcode,
            [
              str
            ]
          ];
        }

        case "operator_letter_of": {
          const letter = generateVal(block.inputs.LETTER, TYPE_INT);
          const str = generateVal(block.inputs.STRING, TYPE_STRING);

          if(letter[1] === null && (letter[2] < 1 || (settings.unsafeFloor && (letter[2] | 0) != letter[2]))){
            return [
              TYPE_STRING,
              null,
              ""
            ];
          }
          
          if(letter[1] === null && str[1] === null && settings.precompute){
            return [
              TYPE_STRING,
              null,
              str[2][letter[2]] ?? ""
            ];
          }

          return [
            TYPE_STRING,
            block.opcode,
            [
              letter,
              str
            ]
          ];
        }

        case "operator_contains": {
          const str1 = generateVal(block.inputs.STRING1, TYPE_STRING);
          const str2 = generateVal(block.inputs.STRING2, TYPE_STRING);

          if(str1[1] === null && str2[1] === null && settings.precompute){
            return [
              TYPE_BOOLEAN,
              null,
              str2[2].toLowerCase().includes(str1[2].toLowerCase())
            ];
          }

          return [
            TYPE_STRING,
            block.opcode,
            [
              str1,
              str2
            ]
          ];
        }

        default:
          console.log(JSON.stringify(block, null, 2));
          throw new Error(`Failed to generate IR: Unknown operator block '${block.opcode}'`);
      }
    }

    function _generateVal(val){
      if(typeof val !== "object" || (val[1] === null && typeof val[2] === "undefined"))
        //I believe this is the only possible way this can occur
        return [TYPE_BOOLEAN, null, false];

      switch(val[0]){
        case 2: //Pointer... most of the time??
          //Leak through

        case 1:   //Immediate? Sometimes pointer?
        case 3: { //Same as 1 except with a default value -- Should have no difference
          if(val[1] === null)
            val[1] = val[2];

          if(typeof val[1] === "string"){
            const expr = generateExpr(blocks[val[1]]);

            //I don't remember why this exists
            //Converting -0 to 0?
            if(
              expr[1] === null &&
              (
                expr[0] === TYPE_INT ||
                expr[0] === TYPE_NUMBER ||
                expr[0] === TYPE_FLOAT
              ) &&
              Object.is(expr[2], -0)
            )
              expr[2] = 0;

            return expr;
          }
          
          if(val[1][0] === 12){
            if(val[1][2] in varTypes)
              return [varTypes[val[1][2]], "data_variable", val[1][2]];
            else
              return [TYPE_ANY, "data_variable", val[1][2]];
          }
          if(val[1][0] === 13)
            return [TYPE_STRING, "data_list", val[1][2]];
          
          if(
            (+val[1][1]).toString() != val[1][1].toString() &&
            !Object.is(+val[1][1], -0)
          ){
            //NaN interpreted as a float
            //String
            return [TYPE_STRING, null, val[1][1]];
          }

          //Float (just NaN lol)
          if(isNaN(+val[1][1]))
            return [TYPE_FLOAT, null, NaN];

          //Number
          if(+val[1][1] % 1)
            return [TYPE_NUMBER, null, +val[1][1]];

          //Int
          //-0 should stay safe
          return [TYPE_INT, null, +val[1][1]];
        }

        default:
          console.log(JSON.stringify(val, null, 2));
          throw new Error(`Unknown value type ${val[0]}`);
      }
    }

    function generateVal(val, type = TYPE_ANY, def = null){
      const res = _generateVal(val);

      if(def === null && type === TYPE_STRING)
        def = "";
      if(def === null && type === TYPE_INT || type === TYPE_NUMBER || type === TYPE_FLOAT)
        def = 0;

      //This shoudn't ever happen?
      if(res[0] === TYPE_UNDEFINED)
        return [type, null, def];

      //No need to convert types if:
      //Converting to int from boolean
      //Converting to number from int or boolean
      //Converting to intstr from int, number, boolean, or string
      if(
        type === TYPE_ANY ||
        type === res[0] ||
        (
          type === TYPE_INT &&
          res[0] === TYPE_BOOLEAN
        ) ||
        (
          type === TYPE_NUMBER &&
          (
            res[0] === TYPE_INT ||
            res[0] === TYPE_BOOLEAN
          )
        ) ||
        (
          type === TYPE_INTSTR &&
          (
            res[0] === TYPE_INT ||
            res[0] === TYPE_STRING ||
            res[0] === TYPE_BOOLEAN //Maybe remove?
          )
        )
      )
        return res;

      //Definetely need to convert types
      if(res[1] === null){
        switch(type){
          case TYPE_INTSTR:
            if(res[0] === TYPE_NUMBER || res[0] === TYPE_FLOAT)
              return [TYPE_INT, null, Math.floor(+res[2] || 0)];
            else
              return [TYPE_STRING, null, res[2].toString()];

          case TYPE_INT: {
            if(!isNum(res[2]))
              return [TYPE_INT, null, 0];

            return [type, null, Math.floor(+res[2])];
          }

          case TYPE_FLOAT:
          case TYPE_NUMBER: {
            if(!isNum(res[2]))
              return [TYPE_NUMBER, null, 0];

            return [TYPE_NUMBER, null, res[2]];
          }

          case TYPE_BOOLEAN:
            return [TYPE_BOOLEAN, null, toBool(res[2])];
            
          case TYPE_STRING:
            return [TYPE_STRING, null, res[2].toString()];
        }
      }
      
      if(type === TYPE_INTSTR){
        if(res[0] === TYPE_NUMBER || res[0] === TYPE_FLOAT)
          return [TYPE_INT, "internal_converttype", res, 0];
        else
          return [TYPE_STRING, "internal_converttype", res, ""];
      }

      return [type, "internal_converttype", res, def];
    }

    //i: Sprite
    //j: Block ID
    //yields: Whether or not the function yields (doesn't matter sometimes, such as for wait blocks)
    let procToken = 0;
    function generateBlocks(i, j, yields){
      let res = [];

      //Repeat until there are no more blocks to read
      while(j !== undefined && j !== null){
        switch(blocks[j].opcode){
          //Control blocks
          case "control_forever": {
            if(yields)
              varTypes = {};

            let sub = generateBlocks(i, blocks[j].inputs.SUBSTACK?.[1], yields);
            let prevVarTypes = {...varTypes};

            //Detect if the script needs to be recompiled to optimize types correctly
            //Delete any variable types that change upon being run in a loop
            let recompile = false;
            for(const k in varTypes){
              if(!(k in prevVarTypes) || varTypes[k] !== prevVarTypes[k]){
                delete varTypes[k];
                recompile = true;
              }
            }
            for(const k in prevVarTypes){
              if(!(k in varTypes) || varTypes[k] !== prevVarTypes[k]){
                delete prevVarTypes[k];
                recompile = true;
              }
            }

            //Recompile if types changed
            if(recompile)
              sub = generateBlocks(i, blocks[j].inputs.SUBSTACK?.[1], yields);

            //Set new variable types (not needed because forever loop)
            varTypes = {...prevVarTypes};

            //Variable types can be changed from another script if there's a yield
            if(yields)
              varTypes = {};

            res.push({
              type: blocks[j].opcode,
              sub: sub
            });
            break;
          }
          
          case "control_wait": {
            //No matter what, this *will* yield at least once
            varTypes = {};
            const dur = generateVal(blocks[j].inputs.DURATION, TYPE_NUMBER);

            forceYield = true;

            //Optimization for 0 and Infinity done at code gen
            res.push({
              type: blocks[j].opcode,
              dur: dur
            });
            break;
          }

          case "control_wait_until": {
            varTypes = {};
            const cond = generateVal(blocks[j].inputs.CONDITION, TYPE_BOOLEAN);
            forceYield = true;

            //Optimize constant condition at code gen
            res.push({
              type: blocks[j].opcode,
              cond: cond
            });
            break;
          }

          case "control_if":
          case "control_while": {
            let cond = generateVal(blocks[j].inputs.CONDITION, TYPE_BOOLEAN, false);

            if(cond[1] === null && blocks[j].opcode === "control_if"){
              //Only generate if definetely going to be run
              if(cond[2])
                res.push(...generateBlocks(i, blocks[j].inputs.SUBSTACK?.[1], yields));
              
            } else if(cond[1] !== null || cond[2]){
              //Run if there isn't a constant condition *or* the condition is always true
              
              if(blocks[j].opcode === "control_while" && yields)
                varTypes = {};
              
              let prevVarTypes = {...varTypes};
              let sub = generateBlocks(i, blocks[j].inputs.SUBSTACK?.[1], yields);

              //Optimize variable types correctly (in case they're overwritten, recompile)
              let recompile = false;
              for(const k in varTypes){
                if(!(k in prevVarTypes) || varTypes[k] !== prevVarTypes[k]){
                  delete varTypes[k];
                  recompile = true;
                }
              }
              for(const k in prevVarTypes){
                if(!(k in varTypes) || varTypes[k] !== prevVarTypes[k]){
                  delete prevVarTypes[k];
                  recompile = true;
                }
              }
              
              prevVarTypes = {...varTypes};
              varTypes = {...prevVarTypes};

              //Recompile both the substack and condition for variable types if needed
              if(blocks[j].opcode === "control_while" && recompile){
                sub = generateBlocks(i, blocks[j].inputs.SUBSTACK?.[1], yields);
                cond = generateVal(blocks[j].inputs.CONDITION, TYPE_BOOLEAN, false);
              }
              
              varTypes = {...prevVarTypes};

              if(cond[1] === null && blocks[j].opcode === "control_while"){
                //Definetely going to be true, so use forever loop
                res.push({
                  type: "control_forever",
                  sub: sub
                });
              } else {
                res.push({
                  type: blocks[j].opcode,
                  cond: cond,
                  sub: sub
                });
              }
            }
            break;
          }

          case "control_repeat_until": {
            //optNot used to convert repeat-until into while
            let cond = optNot(generateVal(blocks[j].inputs.CONDITION, TYPE_BOOLEAN));

            //If there's the possibility the loop will be run...
            if(cond[1] !== null || cond[2]){
              let prevVarTypes = {...varTypes};
              let sub = generateBlocks(i, blocks[j].inputs.SUBSTACK?.[1], yields);

              //Possibly recompile for type optimization
              let recompile = false;
              for(const k in varTypes){
                if(!(k in prevVarTypes) || varTypes[k] !== prevVarTypes[k]){
                  delete varTypes[k];
                  recompile = true;
                }
              }
              for(const k in prevVarTypes){
                if(!(k in varTypes) || varTypes[k] !== prevVarTypes[k]){
                  delete prevVarTypes[k];
                  recompile = true;
                }
              }

              varTypes = {...prevVarTypes};

              //Recompile both subroutine and condition
              if(recompile){
                sub = generateBlocks(i, blocks[j].inputs.SUBSTACK?.[1], yields);
                cond = optNot(generateVal(blocks[j].inputs.CONDITION, TYPE_BOOLEAN));
              }

              varTypes = {...prevVarTypes};

              if(cond[1] === null && cond[2]){
                res.push({
                  type: "control_forever",
                  sub: sub
                });
              } else if(cond[1] !== null){
                //Condition definetely isn't empty
                res.push({
                  type: "control_while",
                  cond: cond,
                  sub: sub
                });
              }
            }

            break;
          }

          case "control_if_else": {
            const cond = generateVal(blocks[j].inputs.CONDITION, TYPE_BOOLEAN);

            if(cond[1] === null){
              //If the condition can be precomputed
              if(cond[2])
                res.push(...generateBlocks(i, blocks[j].inputs.SUBSTACK?.[1], yields));
              else
                res.push(...generateBlocks(i, blocks[j].inputs.SUBSTACK2?.[1], yields));
            } else {
              //Very fun naming to account for both stacks of the if-else
              let prevPrevVarTypes = {...varTypes};
              let sub = generateBlocks(i, blocks[j].inputs.SUBSTACK?.[1], yields);

              let prevVarTypes = {...varTypes};
              varTypes = {...prevPrevVarTypes};
              let sub2 = generateBlocks(i, blocks[j].inputs.SUBSTACK2?.[1], yields);

              //No need to recompile when not for loops -- Just know which variable types are known
              for(const k in varTypes){
                if(!(k in prevVarTypes) || varTypes[k] !== prevVarTypes[k])
                  delete varTypes[k];
              }
              for(const k in prevVarTypes){
                if(!(k in varTypes) || varTypes[k] !== prevVarTypes[k])
                  delete prevVarTypes[k];
              }

              varTypes = {...prevVarTypes};

              res.push({
                type: blocks[j].opcode,
                cond: cond,
                sub: sub,
                sub2: sub2
              });
            }
            break;
          }

          case "control_for_each": {
            let val = generateVal(blocks[j].inputs.VALUE, TYPE_NUMBER);

            if(yields)
              varTypes = {};

            //This can be known to be an int -- After the loop there are no guarentees
            varTypes[blocks[j].fields.VARIABLE[1]] = TYPE_INT;
            let prevVarTypes = {...varTypes};

            let sub = generateBlocks(i, blocks[j].inputs.SUBSTACK?.[1], yields);

            //Recompile variable type optimizations
            let recompile = false;
            for(const k in varTypes){
              if(k !== blocks[j].fields.VARIABLE[1]){
                if(!(k in prevVarTypes) || varTypes[k] !== prevVarTypes[k]){
                  delete varTypes[k];
                  recompile = true;
                }
              }
            }
            for(const k in prevVarTypes){
              if(k !== blocks[j].fields.VARIABLE[1]){
                if(!(k in varTypes) || varTypes[k] !== prevVarTypes[k]){
                  delete prevVarTypes[k];
                  recompile = true;
                }
              }
            }

            //The value of the for-each block is actually recomputed every loop
            //Because of this, recompile it for variable types as well
            if(recompile){
              sub = generateBlocks(i, blocks[j].inputs.SUBSTACK?.[1], yields);
              val = generateVal(blocks[j].inputs.VALUE, TYPE_NUMBER);
            }

            varTypes = {...prevVarTypes};

            res.push({
              type: blocks[j].opcode,
              var: blocks[j].fields.VARIABLE[1],
              val: val,
              sub: sub
            });
            break;
          }

          case "control_repeat": {
            const cond = generateVal(blocks[j].inputs.TIMES, TYPE_NUMBER);

            if(cond[1] === null){
              //Only compile if the loop will be run at all
              if(Math.round(cond[2]) > 0){
                let prevVarTypes = {...varTypes};

                let sub = generateBlocks(i, blocks[j].inputs.SUBSTACK?.[1], yields);
                
                let recompile = false;
                for(const k in varTypes){
                  if(!(k in prevVarTypes) || varTypes[k] !== prevVarTypes[k]){
                    delete varTypes[k];
                    recompile = true;
                  }
                }
                for(const k in prevVarTypes){
                  if(!(k in varTypes) || varTypes[k] !== prevVarTypes[k]){
                    delete prevVarTypes[k];
                    recompile = true;
                  }
                }
    
                if(recompile)
                  sub = generateBlocks(i, blocks[j].inputs.SUBSTACK?.[1], yields);

                res.push({
                  type: blocks[j].opcode,
                  cond: cond,
                  sub: sub
                });
              }
            } else {
              let prevVarTypes = {...varTypes};
  
              let sub = generateBlocks(i, blocks[j].inputs.SUBSTACK?.[1], yields);

              //Recompile for variable type optimizations
              let recompile = false;
              for(const k in varTypes){
                if(!(k in prevVarTypes) || varTypes[k] !== prevVarTypes[k]){
                  delete varTypes[k];
                  recompile = true;
                }
              }
              for(const k in prevVarTypes){
                if(!(k in varTypes) || varTypes[k] !== prevVarTypes[k]){
                  delete prevVarTypes[k];
                  recompile = true;
                }
              }

              //The number of loops doesn't need to be recompiled, unlike for-each
              if(recompile)
                sub = generateBlocks(i, blocks[j].inputs.SUBSTACK?.[1], yields);
              
              varTypes = {...prevVarTypes};
  
              res.push({
                type: blocks[j].opcode,
                cond: cond,
                sub: sub
              });
            }
            
            break;
          }

          case "control_stop":
            res.push({
              type: blocks[j].opcode,
              stop: blocks[j].fields.STOP_OPTION[0]
            });
            break;

          case "control_create_clone_of":
            res.push({
              type: blocks[j].opcode,
              sprite: generateVal(blocks[j].inputs.CLONE_OPTION)
            });
            break;

          case "control_delete_this_clone":
            res.push({
              type: blocks[j].opcode
            });
            break;

          case "control_clear_counter":
          case "control_incr_counter":
            res.push({
              type: blocks[j].opcode
            });
            break;

          //Event blocks
          case "event_broadcast":
          case "event_broadcastandwait":
            if(blocks[j].opcode === "event_broadcastandwait"){
              varTypes = {};
              forceYield = true;
            }

            res.push({
              type: blocks[j].opcode,
              broad: generateVal(blocks[j].inputs.BROADCAST_INPUT, TYPE_STRING)
            });
            break;

          //Motion blocks
          //These only apply for sprites that aren't the stage

          //TODO: Actually impliment. Shouldn't be too difficult.
          case "motion_goto":
            if(sprite > 0){
              res.push({
                type: blocks[j].opcode,
                to: generateVal(blocks[j].inputs.TO, TYPE_STRING)
              });
            }
            break;

          case "motion_glidesecstoxy":
            if(sprite > 0){
              res.push({
                type: blocks[j].opcode,
                x: generateVal(blocks[j].inputs.X, TYPE_NUMBER),
                y: generateVal(blocks[j].inputs.Y, TYPE_NUMBER),
                secs: generateVal(blocks[j].inputs.SECS, TYPE_NUMBER)
              });
              forceYield = true;
            }
            break;

          case "motion_gotoxy":
            if(sprite > 0){
              res.push({
                type: blocks[j].opcode,
                x: generateVal(blocks[j].inputs.X, TYPE_NUMBER),
                y: generateVal(blocks[j].inputs.Y, TYPE_NUMBER)
              });
            }
            break;

          case "motion_setx":
            if(sprite > 0){
              res.push({
                type: blocks[j].opcode,
                val: generateVal(blocks[j].inputs.X, TYPE_NUMBER)
              });
            }
            break;

          case "motion_changexby":
            if(sprite > 0){
              res.push({
                type: blocks[j].opcode,
                val: generateVal(blocks[j].inputs.DX, TYPE_NUMBER)
              });
            }
            break;

          case "motion_sety":
            if(sprite > 0){
              res.push({
                type: blocks[j].opcode,
                val: generateVal(blocks[j].inputs.Y, TYPE_NUMBER)
              });
            }
            break;

          case "motion_changeyby":
            if(sprite > 0){
              res.push({
                type: blocks[j].opcode,
                val: generateVal(blocks[j].inputs.DY, TYPE_NUMBER)
              });
            }
            break;

          case "motion_movesteps":
            if(sprite > 0){
              res.push({
                type: blocks[j].opcode,
                val: generateVal(blocks[j].inputs.STEPS, TYPE_NUMBER)
              });
            }
            break;

          //TODO: Actually impliment still
          case "motion_pointtowards":
            if(sprite > 0){
              res.push({
                type: blocks[j].opcode,
                dir: generateVal(blocks[j].inputs.TOWARDS, TYPE_STRING)
              });
            }
            break;

          case "motion_pointindirection":
            if(sprite > 0){
              res.push({
                type: blocks[j].opcode,
                dir: generateVal(blocks[j].inputs.DIRECTION, TYPE_NUMBER)
              });
            }
            break;

          case "motion_turnright":
          case "motion_turnleft":
            if(sprite > 0){
              res.push({
                type: blocks[j].opcode,
                val: generateVal(blocks[j].inputs.DEGREES, TYPE_NUMBER)
              });
            }
            break;

          //TODO: impliment when sprite rendering exists
          case "motion_setrotationstyle":
            if(sprite > 0){
/*
              res.push({
                type: blocks[j].opcode,
                val: blocks[j].fields.STYLE[0]
              });
*/
            }
            break;

          //Looks blocks
          //Almost all of these are commented out because sprite rendering doesn't exist yet


          case "looks_gotofrontback":
          case "looks_goforwardbackwardlayers":
            if(sprite > 0){
/*
              res.push({
                type: blocks[j].opcode,
                val: blocks[j].fields.FRONT_BACK[0]
              });
*/
            }
            break;

          case "looks_cleargraphiceffects":
/*
            res.push({
              type: blocks[j].opcode
            });
*/
            break;

          //Kept track of because it's a simple flag
          case "looks_show":
          case "looks_hide":
            res.push({
              type: blocks[j].opcode
            });
            break;

          case "looks_setsizeto":
/*
            res.push({
              type: blocks[j].opcode,
              str: generateVal(blocks[j].inputs.SIZE, TYPE_NUMBER)
            });
*/
            break;

          case "looks_changesizeby":
/*
            res.push({
              type: blocks[j].opcode,
              str: generateVal(blocks[j].inputs.CHANGE, TYPE_NUMBER)
            });
*/
            break;

          case "looks_seteffectto":
          case "looks_changeeffectby":
/*
            res.push({
              type: blocks[j].opcode,
              effect: blocks[j].fields.EFFECT;
              val: generateVal(blocks[j].inputs.VALUE, TYPE_NUMBER)
            });
*/
            break;

          //Unimplimented but put in to fit with looks_sayforsecs
          case "looks_say":
            res.push({
              type: blocks[j].opcode,
              str: generateVal(blocks[j].inputs.MESSAGE, TYPE_STRING)
            });
            break;

          //Wait is implimented, nothing else
          case "looks_sayforsecs": {
            const dur = generateVal(blocks[j].inputs.SECS, TYPE_STRING);
            forceYield = true;
            varTypes = {};

            res.push({
              type: blocks[j].opcode,
              str: generateVal(blocks[j].inputs.MESSAGE, TYPE_STRING),
              dur: dur
            });
            break;
          }

          case "looks_switchcostumeto":
/*
            res.push({
              type: blocks[j].opcode,
              val: generateVal(blocks[j].inputs.COSTUME, TYPE_INTSTR)
            });
*/
            break;

          //Yield may be important
          case "looks_switchbackdropto":
          case "looks_switchbackdroptoandwait":
            //For the yield
            if(blocks[j].opcode === "looks_switchbackdroptoandwait")
              varTypes = {};

            res.push({
              type: blocks[j].opcode,
              val: generateVal(blocks[j].inputs.BACKDROP, TYPE_INTSTR)
            });
            break;

          //Sound blocks (unimplimented, but often used, so commented out)
          case "sound_stopallsounds":
            forceYield = true;
            varTypes = {};
/*
            res.push({
              type: blocks[j].opcode
            });
*/
            break;

          case "sound_play":
          case "sound_playuntildone":
            forceYield = true;
            varTypes = {};
            
/*
            res.push({
              type: blocks[j].opcode,
              sound: generateVal(blocks[j].inputs.SOUND_MENU)
            });
*/
            break;

          //Simply value to keep track of
          case "sound_setvolumeto":
          case "sound_changevolumeby":
            forceYield = true;
            varTypes = {};
            
            res.push({
              type: blocks[j].opcode,
              sound: generateVal(blocks[j].inputs.VOLUME, TYPE_INT)
            });
            break;

          case "sound_seteffectto":
            forceYield = true;
            varTypes = {};
            
/*
            res.push({
              type: blocks[j].opcode,
              val: generateVal(blocks[j].inputs.VOLUME, TYPE_INT),
              effect: blocks[j].fields.EFFECT[0]
            });
*/
            break;

          //Sensing blocks
          case "sensing_resettimer":
            res.push({
              type: blocks[j].opcode
            });
            break;

          //Just returns the "answer" variable
          case "sensing_askandwait":
            forceYield = true;
            varTypes = {};
            
            res.push({
              type: blocks[j].opcode,
              quest: generateVal(blocks[j].inputs.QUESTION, TYPE_STRING)
            });
            break;

          //Pen blocks
          case "pen_penDown":
          case "pen_penUp":
          case "pen_clear":
          case "pen_stamp":
            res.push({
              type: blocks[j].opcode
            });
            break;

          case "pen_setPenSizeTo":
          case "pen_changePenSizeBy":
            res.push({
              type: blocks[j].opcode,
              size: generateVal(blocks[j].inputs.SIZE, TYPE_NUMBER)
            });
            break;

          case "pen_setPenColorParamTo": //Later
          case "pen_changePenColorParamBy":
            res.push({
              type: blocks[j].opcode,
              param: generateVal(blocks[j].inputs.COLOR_PARAM, TYPE_STRING),
              val: generateVal(blocks[j].inputs.VALUE, TYPE_INTSTR)
            });
            break;

          case "pen_setPenHueToNumber":
          case "pen_changePenHueBy":
            res.push({
              type: blocks[j].opcode,
              col: generateVal(blocks[j].inputs.HUE, TYPE_INT)
            });
            break;

          //Unimplimented -- Simple formula
          case "pen_setPenShadeToNumber":
          case "pen_changePenShadeBy":
/*
            res.push({
              type: blocks[j].opcode,
              col: generateVal(blocks[j].inputs.HUE, TYPE_INT)
            });
*/
            break;


          case "pen_setPenColorToColor":
            res.push({
              type: blocks[j].opcode,
              col: generateVal(blocks[j].inputs.COLOR, TYPE_INTSTR, TYPE_STRING)
            });
            break;

          //Variable operations
          case "data_showvariable":
          case "data_hidevariable": {
            res.push({
              type: blocks[j].opcode,
              var: blocks[j].fields.VARIABLE
            });
            break;
          }

          case "data_setvariableto": {
            const val = generateVal(blocks[j].inputs.VALUE);

            varTypes[blocks[j].fields.VARIABLE[1]] = val[0];

            res.push({
              type: blocks[j].opcode,
              var: blocks[j].fields.VARIABLE,
              val: val
            });
            break;
          }

          case "data_changevariableby": {
            const val = generateVal(blocks[j].inputs.VALUE, TYPE_NUMBER);

            //Manually put in some stuff
            if(
              varTypes[blocks[j].fields.VARIABLE[1]] === TYPE_INT ||
              varTypes[blocks[j].fields.VARIABLE[1]] === TYPE_BOOLEAN ||
              varTypes[blocks[j].fields.VARIABLE[1]] === TYPE_NUMBER
            ){
              //Impliment with +=
              res.push({
                type: "data_changevariableby",
                var: blocks[j].fields.VARIABLE,
                val: val
              });
            } else {
              //Need to convert to number first
              res.push({
                type: "data_setvariableto",
                var: blocks[j].fields.VARIABLE,
                val: [
                  TYPE_NUMBER,
                  "operator_add",
                  [
                    generateVal([1, [12, blocks[j].fields.VARIABLE[0], blocks[j].fields.VARIABLE[1]]], TYPE_NUMBER),
                    val
                  ]
                ]
              });
            }

            //Update variable type
            if(
              blocks[j].fields.VARIABLE[1] in varTypes &&
              (
                varTypes[blocks[j].fields.VARIABLE[1]] === TYPE_INT ||
                varTypes[blocks[j].fields.VARIABLE[1]] === TYPE_BOOLEAN
              ) &&
              (
                val[0] === TYPE_INT ||
                val[0] === TYPE_BOOLEAN
              )
            )
              varTypes[blocks[j].fields.VARIABLE[1]] = TYPE_INT;
            else
              varTypes[blocks[j].fields.VARIABLE[1]] = TYPE_NUMBER;

            break;
          }

          //List operations
          case "data_deletealloflist":
          case "data_showlist": //These following two aren't implimented but are used by some things
          case "data_hidelist":
            res.push({
              type: blocks[j].opcode,
              list: blocks[j].fields.LIST
            });
            break;

          case "data_addtolist":
            res.push({
              type: blocks[j].opcode,
              list: blocks[j].fields.LIST,
              val: generateVal(blocks[j].inputs.ITEM)
            });
            break;

          case "data_deleteoflist":
            res.push({
              type: blocks[j].opcode,
              list: blocks[j].fields.LIST,
              idx: generateVal(blocks[j].inputs.INDEX, TYPE_INTSTR, TYPE_INT)
            });
            break;

          case "data_insertatlist":
          case "data_replaceitemoflist":
            res.push({
              type: blocks[j].opcode,
              list: blocks[j].fields.LIST,
              val: generateVal(blocks[j].inputs.ITEM),
              idx: generateVal(blocks[j].inputs.INDEX, TYPE_INTSTR, TYPE_INT)
            });
            break;

          case "procedures_call": {
            let args = {};
            const argTypes = blocks[j].mutation.proccode.match(/%[sbn]/g) || [];
            const argIDs = JSON.parse(blocks[j].mutation.argumentids);

            for(const arg in argIDs){
              //%n doesn't force numbers :(
              // args[argIDs[arg]] = generateVal(blocks[j].inputs[argIDs[arg]], argTypes[arg] === "%s" ? TYPE_ANY : argTypes[arg] === "%n" ? TYPE_NUMBER : TYPE_BOOLEAN, argTypes[arg] === "%s" ? 0 : argTypes[arg] === "%n" ? 0 : false);
              args[argIDs[arg]] = generateVal(
                blocks[j].inputs[argIDs[arg]],
                argTypes[arg] === "%b" ? TYPE_BOOLEAN : TYPE_ANY,
                argTypes[arg] === "%b" ? false : 0
              );
            }

            //Keep track of custom blocks run for future optimizations
            customCalls.push(blocks[j].mutation.proccode);

            res.push({
              type: blocks[j].opcode,
              proccode: blocks[j].mutation.proccode,
              args: args
            });

            varTypes = {};
            break;
          }

          default:
            console.log(JSON.stringify(blocks[j], null, 2));
            throw new Error(`Failed to generate IR: Unknown block '${blocks[j].opcode}'`);
        }

        j = blocks[j].next;
      }

      return res;
    }


    for(const i in blocks){
      if(blocks[i].topLevel /* && blocks[i].next !== null*/){
        let yields = true;

        switch(blocks[i].opcode){
          case "event_whenflagclicked":
            res[i] = [{
              type: "event_whenflagclicked"
            }];
            break;

          case "event_whenkeypressed":
            res[i] = [{
              type: "event_whenkeypressed",
              key: blocks[i].fields.KEY_OPTION[0]
            }];
            break;

          case "event_whenbroadcastreceived":
            res[i] = [{
              type: "event_whenbroadcastreceived",
              broad: blocks[i].fields.BROADCAST_OPTION[0]
            }];
            break;
          
          case "control_start_as_clone":
            res[i] = [{
              type: "control_start_as_clone"
            }];
            break;

          case "procedures_definition": {
            const def = blocks[blocks[i].inputs.custom_block[1]];

            //Get all argument names, IDs, and types (only %s and %b really exist)
            argNames = JSON.parse(def.mutation.argumentnames);
            argIDs = JSON.parse(def.mutation.argumentids);
            argTypes = (def.mutation.proccode.match(/%[sbn]/g) || []).map(type => type == "%s" ? TYPE_ANY : TYPE_BOOLEAN);

            argIdxs = {};
            for(const j in argNames)
              argIdxs[argNames[j]] = j;

            //If this has already been compiled, don't care (yes, this has happened)
            if(def.mutation.proccode in customIDs[sprite])
              continue;

            //Set the data for the custom blocks
            customIDs[sprite][def.mutation.proccode] = "p" + (procToken++);
            customBlocks[sprite][def.mutation.proccode] = {
              warp: def.mutation.warp == "true", //Funny
              argNames: argNames,
              argIDs: argIDs,
              argTypes: argTypes
            };

            yields = def.mutation.warp == "false";

            res[i] = [{
              type: "procedures_definition",
              proccode: def.mutation.proccode,
              warp: def.mutation.warp == "true",
              argNames: argNames,
              argIDs: argIDs,
              argTypes: argTypes
            }];

            if(blocks[i].next === null)
              commentBlocks[sprite].push(def.mutation.proccode);
            break;
          }

          default:
            console.log(JSON.stringify(blocks[i], null, 2));
            console.warn(`Unknown hat block '${blocks[i].opcode}'`);
            continue; //Maybe not the best practice, but I'd say it's acceptable here
        }

        //Get the data for this specific stack of blocks
        forceYield = false; //This will be important in the future, along with variable type knowledge for functions
        varTypes = {};
        customCalls = [];
        res[i].push(...generateBlocks(i, blocks[i].next, yields));
        res[i][0].customCalls = customCalls;

        //If nothing is done in this custom block, mark it as a "comment block"
        if(res[i].length === 1 && blocks[i].opcode === "procedures_definition")
          commentBlocks[sprite].push(blocks[blocks[i].inputs.custom_block[1]].mutation.proccode);
      }
    }
    return res;
  }

  let token = 1;

  //TODO: Minify
  const token_render = "render";
  const token_this = "self";
  const token_engine = "engine";
  const token_stage = "stage";
  const token_id = "id";


  const startToken = token;

  const token_penCanvas = "penCanvas";
  const token_penCtx = "penCtx";
  const token_renderCanvas = "renderCanvas";
  const token_renderCtx = "renderCtx";
  const token_pen_clear = "penClear";
  const token_init = "init";
  const token_drawPen = "drawPen";

  const token_broadcast = "broadcast";
  const token_broadcast_wait = "broadcastWait";
  const token_create_clone = "createClone";
  const token_delete_clone = "deleteClone";
  const token_askWait = "askWait";
  const token_answer = "answer";
  const token_start = "start";
  const token_toBool = "toBool";
  const token_modulo = "modulo";
  const token_tan = "tan";
  const token_eq = "equals";
  const token_neq = "notEqual";
  const token_lt = "lessThan";
  const token_leq = "lessThanEqual";
  const token_gt = "greaterThan";
  const token_geq = "greaterThanEqual";
  const token_hideVar = "hideVar";
  const token_showVar = "showVar";
  const token_hideList = "hideList";
  const token_showList = "showList";
  const token_listStr = "listStr";
  const token_listIdx = "listIdx";
  const token_listInsert = "listInsert"; //Because JS's splice
  const token_listReplace = "listReplace";
  const token_listDelete = "listDelete";
  const token_randInt = "randInt";
  const token_randFloat = "randFloat";
  const token_randNum = "randNum";
  const token_sprites = "sprites";
  const token_spriteDefs = "spriteDefs";
  const token_iterators = "iterators";
  const token_gotoXY = "gotoXY";
  const token_playFull = "playFull";
  const token_penColInt = "penColInt";
  const token_penCol = "penCol";
  const token_rgbHSV = "rgbHSV";
  const token_keys = "keys";
  const token_keyPressed = "keyPressed";
  const token_mouseX = "mouseX";
  const token_mouseY = "mouseY";
  const token_mouseDown = "mouseDown";
  const token_counter = "counter";



  let tToken = 0;

  const token_broad = generateID(tToken++);
  const token_flag = generateID(tToken++);
  const token_x = generateID(tToken++);
  const token_y = generateID(tToken++);
  const token_dir = generateID(tToken++);
  const token_showing = generateID(tToken++);
  const token_volume = generateID(tToken++);
  const token_penDown = generateID(tToken++);
  const token_penColor = generateID(tToken++);
  const token_penAlpha = generateID(tToken++);
  const token_penSize = generateID(tToken++);
  const token_whenKey = generateID(tToken++);

  const startTToken = tToken;


  let startVarToken = 0;
  let varToken = 0;

  let init = "";
  let res = "";
  for(const i in json.targets){
    sprite = i;
    varID = 0;
    varToken = startVarToken;
    varIDs.push({});

    tToken = startTToken; //"This token"

    customIDs[sprite] = {};
    customBlocks[sprite] = {};
    commentBlocks[sprite] = [];
    procToken = 0;
    let ir = generateIR(json.targets[i].blocks);
    token = startToken;

    function escapeStr(str){
      return JSON.stringify(str);
    }

    function escapeVal(val){
      if(typeof val === "string")
        return escapeStr(val);
      
      if(typeof val === "boolean")
        return val.toString();

      if(isNaN(val))
        return "NaN";

      //This is important for say, 1 / -0
      if(Object.is(val, -0))
        return "-0";
      
      return val.toString();
    }

    function convertVar(id, owner = sprite){
      if(!(id in varIDs[owner]) && !(id in varIDs[0]))
        varIDs[owner][id] = "v" + (varToken++);
      
      if(owner === sprite && (id in varIDs[owner]))
        return varIDs[owner][id];
      else if(owner === sprite && (id in varIDs[0]))
        return varIDs[0][id];
      else
        //TODO: Impliment sensing_of
        throw new Error("Reading variables of other sprites not supported");
    }

    //Convert a list and an index to an index of the list as a string
    function listIdx(list, idx){
      if(idx[0] === TYPE_INT){
        if(idx[1] === null)
          return idx[2] - 1;

        return `(${compileVal(idx)})-1`;
      } else {
        if(
          idx[0] !== TYPE_STRING &&
          idx[0] !== TYPE_INTSTR &&
          idx[0] !== TYPE_ANY &&
          idx[0] !== TYPE_UNDEFINED
        ){
          if(idx[1] === null)
            return Math.floor(idx[2]) - 1;

          if(settings.unsafeFloor)
            return `((${compileVal(idx)})|0)-1`;
          else
            return `Math.floor(${compileVal(idx)})-1`;
        } else
          //Known cases with direct strings
          if(idx[1] === null)
            return (idx[2].toString().toLowerCase() === "last" ? `${list}.length-1` : idx[2].toString().toLowerCase() === "random" || idx[2].toString().toLowerCase() === "any" ? (settings.unsafeFloor ? `(Math.random()*${list}.length)|0` : `Math.floor(Math.random()*${list}.length)`) : isNum(idx[2]) ? +idx[2] : -1);

          return `${token_listIdx}(${list}.length,${compileVal(idx)})`;
      }
    }

    //Convert the type of a value, constant or not
    function convertActualType(val, type){
      if(val[0] === type)
        return compileVal(val);

      if(val[1] !== null)
        return convertType(compileVal(val), val[0], type);

      switch(type){
        case TYPE_INT:
          val[0] = TYPE_INT;
          val[2] = Math.floor(+val[2] || 0);
          break;

        case TYPE_FLOAT:
          val[0] = TYPE_FLOAT;
          val[2] = +val[2];
          break;

        case TYPE_NUMBER:
          val[0] = TYPE_NUMBER;
          val[2] = +val[2] || 0;
          break;

        case TYPE_BOOLEAN:
          val[0] = TYPE_BOOLEAN;
          val[2] = toBool(val[2]);
          break;

        case TYPE_STRING:
          val[0] = TYPE_STRING;
          val[2] = val[2].toString();
          break;
      }

      return compileVal(val);
    }

    function convertType(val, typeFrom, typeTo){
      if(typeFrom === typeTo)
        return val;
      
      let res = "";

      switch(typeTo){
        case TYPE_INT: {
          if(typeFrom === TYPE_BOOLEAN)
            return `+(${val})`;

          if(typeFrom === TYPE_STRING || typeFrom === TYPE_INTSTR || typeFrom === TYPE_ANY || typeFrom === TYPE_UNDEFINED)
            return `Math.floor(+(${val}))`;

          return `Math.floor(${val})`;
        }

        case TYPE_FLOAT: //Just ignore this case for the most part
        case TYPE_NUMBER: {
          if(typeFrom === TYPE_BOOLEAN)
            return `+(${val})`;

          if(typeFrom === TYPE_FLOAT && typeTo === TYPE_NUMBER)
            return `(${val})||0`;

          if(typeFrom === TYPE_STRING || typeFrom === TYPE_INTSTR || typeFrom === TYPE_ANY || typeFrom === TYPE_UNDEFINED)
            return `+(${val})||0`;

          return `${val}`;
        }

        case TYPE_BOOLEAN:
          if(typeFrom === TYPE_INT || typeFrom === TYPE_NUMBER || typeFrom === TYPE_FLOAT)
            return `!!(${val})`;

          return `${token_toBool}(${val})`;

        case TYPE_STRING:
          return `""+(${val})`;
      }
    }

    //Detect if it's safe to compare two values
    function safeCompare(val, id){
      if(val[2][0][0] === TYPE_FLOAT && val[2][1][0] === TYPE_FLOAT){
        if([
          false, // (FLOAT == FLOAT)  (NaN == NaN)
          false, // (FLOAT != FLOAT)  (NaN != NaN)
          false, // (FLOAT >  FLOAT)  (NaN >  0  )
          false, // (FLOAT >= FLOAT)  (NaN >= NaN)
          false, // (FLOAT <  FLOAT)  (0   <  NaN)
          false, // (FLOAT <= FLOAT)  (NaN <= NaN)
        ][id])
          return true;
      }

      if(val[2][0][0] === TYPE_FLOAT && (val[2][1][0] === TYPE_NUMBER || val[2][1][0] === TYPE_INT || val[2][1][0] === TYPE_BOOLEAN)){
        if([
          true,  // (FLOAT == NUMBER)
          true,  // (FLOAT != NUMBER)
          false, // (FLOAT >  NUMBER) (0   >  NaN)
          false, // (FLOAT >= NUMBER) (0   >= NaN)
          true,  // (FLOAT <  NUMBER)
          true,  // (FLOAT <= NUMBER)
        ][id])
          return true;
      }

      if((val[2][0][0] === TYPE_NUMBER || val[2][0][0] === TYPE_INT || val[2][0][0] === TYPE_BOOLEAN) && val[2][1][0] === TYPE_FLOAT){
        if([
          true,  // (NUMBER == FLOAT)
          true,  // (NUMBER != FLOAT)
          true,  // (NUMBER >  FLOAT)
          true,  // (NUMBER >= FLOAT)
          false, // (NUMBER <  FLOAT) (0   <  NaN)
          false, // (NUMBER <= FLOAT) (0   <= NaN)
        ][id])
          return true;
      }

      return (
        //These two types are especially unsafe to compare with
        val[2][0][0] !== TYPE_ANY &&
        val[2][0][0] !== TYPE_FLOAT &&
        (
          //Unsafe to compare a string with a number without prior conversion
          //Should be handled in code, but left in for safety
          (
            val[2][0][0] !== TYPE_STRING &&
            val[2][0][0] !== TYPE_INTSTR
          ) ||
          (
            val[2][0][1] === null &&
            isNum(val[2][0][2])
          )
        ) &&
        
        val[2][1][0] !== TYPE_FLOAT &&
        val[2][1][0] !== TYPE_ANY &&
        (
          (
            val[2][1][0] !== TYPE_STRING &&
            val[2][1][0] !== TYPE_INTSTR
          ) ||
          (
            val[2][1][1] === null &&
            isNum(val[2][1][2])
          )
        )
      );
    }

    function compileVal(val){
      if(val[1] === null){
        //Compile -0 correctly
        if(
          Object.is(+val[2], -0) &&
          (
            val[0] === TYPE_INT ||
            val[0] === TYPE_FLOAT ||
            val[0] === TYPE_NUMBER
          )
        )
          return "-0";
        
        switch(val[0]){
          case TYPE_INT:
            return escapeVal(Math.floor(+val[2] || 0));
          case TYPE_FLOAT:
            return escapeVal(+val[2]);
          case TYPE_NUMBER:
            return escapeVal(+val[2] || 0);
          case TYPE_BOOLEAN:
            return escapeVal(toBool(val[2]));

          default:
            return escapeVal(val[2].toString());
        }
      } else {
        //Compile blocks instead of values
        switch(val[1]){
          case "internal_converttype":
            return convertType(compileVal(val[2]), val[2][0], val[0]);


          //Argument operators
          case "argument_reporter_boolean":
          case "argument_reporter_string_number":
            return argIDs[val[3]];

          //Data operators
          case "data_variable":
            return convertVar(val[2]);

          case "data_list":
            return `${token_listStr}(${convertVar(val[2])})`;

          case "data_lengthoflist":
            return `${convertVar(val[3][1])}.length`;

          case "data_itemoflist": {
            const list = convertVar(val[3][1]);
            const idx = listIdx(list, val[2][0]);

            //Handled by IR generation, but keep in to be safe
            if(idx[1] !== null || idx[2] > -1)
              return `${list}[${listIdx(list, val[2][0])}]??""`;
            else
              return `""`;
          }

          case "data_itemnumoflist": {
            const list = convertVar(val[3][1]);

            //Convert to more basic comparisons if possible
            if(val[2][0][1] === null){
              if(!isNum(val[2][0][2])){
                const str = val[2][0][2].toString();

                if(str.toLowerCase() === str.toUpperCase())
                  return `${list}.indexOf(${escapeStr(str)})+1`;
                else
                  return `${list}.findIndex(_=>(_+"").toLowerCase()==${+val[2][0][2] || 0})+1`;
              } else
                return `${list}.findIndex(_=>(+_||0)==${+val[2][0][2] || 0})+1`;
            }
            //Would be fair game if it weren't for Infinity
/*
            else if(val[2][0][0] === TYPE_NUMBER || val[2][0][0] === TYPE_INT || val[2][0][0] === TYPE_BOOLEAN)
              return `${list}.findIndex(_=>(+_||0)==(${compileVal(val[2][0], TYPE_NUMBER)}))`;
*/
            else
              return `${list}.findIndex(_=>${token_eq}(_,${compileVal(val[2][0])}))+1`;
          }

          case "data_listcontainsitem": {
            const list = convertVar(val[3][1]);

            if(val[2][0][1] === null){
              if(!isNum(val[2][0][2])){
                const str = val[2][0][2].toString();

                if(str.toLowerCase() === str.toUpperCase())
                  return `${list}.includes(${escapeStr(str)})`;
                else
                  return `!${list}.every(_=>(_+"").toLowerCase()!=${escapeStr(str.toLowerCase())})`;
              } else
                return `!${list}.every(_=>(+_||0)!=${+val[2][0][2] || 0})`;
            } else
              return `!${list}.every(_=>!${token_eq}(_,${compileVal(val[2][0])}))`;
          }


          //Control blocks
          case "control_get_counter":
            return token_counter;


          //Motion blocks
          case "motion_xposition":
            return `${token_this}.${token_x}`;

          case "motion_yposition":
            return `${token_this}.${token_y}`;

          case "motion_direction":
            return `57.29577951308232*${token_this}.${token_dir}`;


          //Looks blocks

          //Not handled yet
          case "looks_size":
            return 100;


          //Sensing blocks
          case "sensing_answer":
            return token_answer;

          case "sensing_keypressed":
            if(val[3][0] === TYPE_INT || val[3][1] === null){
              //Handle non-variable values without a function call
              if(val[3][0] === TYPE_STRING){
                switch(val[3][2].toUpperCase()){
                  case "ANY":
                    return `Object.values(${token_keys}).includes(true)`;

                  case "ENTER":
                    return `${token_keys}.ENTER`;

                  case "SPACE":
                    return `${token_keys}[" "]`;

                  case "LEFT ARROW":
                    return `${token_keys}.ARROWLEFT`;

                  case "UP ARROW":
                    return `${token_keys}.ARROWUP`;

                  case "RIGHT ARROW":
                    return `${token_keys}.ARROWRIGHT`;

                  case "DOWN ARROW":
                    return `${token_keys}.ARROWDOWN`;

                  default:
                    if("ABCDEFGHIJKLMNOPQRSTUVWXYZ_$".includes(val[3][2][0].toUpperCase()))
                      return `${token_keys}.${val[3][2][0].toUpperCase()}`;
                    else
                      return `${token_keys}[${JSON.stringify(val[3][2][0].toUpperCase())}]`;
                }
              } else
                return `${token_keys}[${JSON.stringify(String.fromCharCode(val[3][2]))}]`;
            } else
              return `${token_keyPressed}(${compileVal(val[3])})`;

            break;

          case "sensing_mousex":
            return `${token_mouseX}`;

          case "sensing_mousey":
            return `${token_mouseY}`;

          case "sensing_mousedown":
            return `${token_mouseDown}`;

          case "sensing_timer":
            return `(Date.now()-${token_start})/1e3`;

          case "sensing_dayssince2000":
            return `Date.now()/864e5-10957`;

          case "sensing_current": {
            switch(val[2]){
              case "year":
                return `1900+new Date().getYear()`;
              case "month":
                return `1+new Date().getMonth()`;
              case "date":
                return `new Date().getDate()`;
              case "day of week":
                return `1+new Date().getDay()`;
              case "hour":
                return `new Date().getHours()`;
              case "minutes":
                return `new Date().getMinutes()`;
              case "seconds":
                return `new Date().getSeconds()`;
            }
          }

          
          //Sound blocks
          case "sound_volume":
            return `${token_this}.${token_volume}`;


          //Operators
          case "operator_add":
            return `(${compileVal(val[2][0])})+(${compileVal(val[2][1])})`;

          case "operator_join": //Same as above but with strings
            return `(${compileVal(val[2][0])})+(${compileVal(val[2][1])})`;

          case "operator_subtract":
            if(val[2][0][1] === null && val[2][0][2] == 0)
              return `-(${compileVal(val[2][1])})`;

            return `(${compileVal(val[2][0])})-(${compileVal(val[2][1])})`;

          case "operator_multiply":
            return `(${compileVal(val[2][0])})*(${compileVal(val[2][1])})`;

          case "operator_divide":
            return `(${compileVal(val[2][0])})/(${compileVal(val[2][1])})`;

          case "operator_mod": //Only using function because negative numbers
            return `${token_modulo}(${compileVal(val[2][0])},${compileVal(val[2][1])})`;

          case "operator_round":
            return `Math.round(${compileVal(val[2][0])})`;


          case "operator_mathop_floor":
            return `Math.floor(${compileVal(val[2][0])})`;

          case "operator_mathop_ceiling":
            return `Math.ceil(${compileVal(val[2][0])})`;

          case "operator_mathop_abs":
            return `Math.abs(${compileVal(val[2][0])})`;

          case "operator_mathop_sqrt":
            return `Math.sqrt(${compileVal(val[2][0])})`;

          case "operator_mathop_sin":
            if(settings.accurateTrig)
              //Unsafe floor doesn't care about accurate trig
              return `Math.round(Math.sin(.017453292519943295*(${compileVal(val[2][0])}))*1e10)/1e10`;
            else
              return `Math.sin(.017453292519943295*(${compileVal(val[2][0])}))`;

          case "operator_mathop_cos":
            if(settings.accurateTrig)
              return `Math.round(Math.cos(.017453292519943295*(${compileVal(val[2][0])}))*1e10)/1e10`;
            else
              return `Math.cos(.017453292519943295*(${compileVal(val[2][0])}))`;

          case "operator_mathop_tan":
            //You can't get away with a simple method of implimenting this one
            return `${token_tan}(${compileVal(val[2][0])})`;

          case "operator_mathop_asin":
            return `57.29577951308232*Math.asin(${compileVal(val[2][0])})`;

          case "operator_mathop_acos":
            return `57.29577951308232*Math.acos(${compileVal(val[2][0])})`;

          case "operator_mathop_atan":
            return `57.29577951308232*Math.atan(${compileVal(val[2][0])})`;

          case "operator_mathop_ln":
            return `Math.log(${compileVal(val[2][0])})`;

          case "operator_mathop_log":
            return `Math.log(${compileVal(val[2][0])})/2.302585092994046`;

          case "operator_mathop_e ^":
            return `Math.exp(${compileVal(val[2][0])})`;

          case "operator_mathop_10 ^":
            return `Math.pow(10,${compileVal(val[2][0])})`;


          case "operator_random": {
            if(val[0] === TYPE_INT)
              return `${token_randInt}(${compileVal(val[2][0])},${compileVal(val[2][1])})`;
            else if(val[3]) //Will always generate a decimal
              return `${token_randFloat}(${compileVal(val[2][0])},${compileVal(val[2][1])})`;
            else
              return `${token_randNum}(${compileVal(val[2][0])},${compileVal(val[2][1])})`;
          }


          case "operator_equals": {
            if(val[2][0][1] === null && isNum(val[2][0][2]) && Math.abs(+val[2][0][2]) != Infinity)
              return `${+val[2][0][2]}==(${convertActualType(val[2][1], TYPE_FLOAT)})`;
            
            if(val[2][1][1] === null && isNum(val[2][1][2]) && Math.abs(+val[2][1][2]) != Infinity)
              return `(${convertActualType(val[2][0], TYPE_FLOAT)})==${+val[2][1][2]}`;

            
            //Use toLowerCase as little as possible
            //Note that this code is essentially duplicated 6 times for different comparison operators
            if(
              (
                val[2][0][1] === null &&
                val[2][0][0] === TYPE_STRING &&
                !isNum(val[2][0][2])
              )
            ){
              if(val[2][1][0] === TYPE_STRING){
                if(val[2][0][2].toLowerCase() === val[2][0][2].toUpperCase())
                  return `${escapeStr(val[2][0][2])}==(${compileVal(val[2][1])})`;
                else
                  return `${escapeStr(val[2][0][2].toLowerCase())}==(${compileVal(val[2][1])}).toLowerCase()`;
              } else {
                if(val[2][0][2].toLowerCase() === val[2][0][2].toUpperCase())
                  return `${escapeStr(val[2][0][2].toLowerCase())}==(${compileVal(val[2][1])}).toString()`;
                else
                  return `${escapeStr(val[2][0][2].toLowerCase())}==(${compileVal(val[2][1])}).toString().toLowerCase()`;
              }
            }

            if(
              (
                val[2][1][1] === null &&
                val[2][1][0] === TYPE_STRING &&
                !isNum(val[2][1][2])
              )
            ){
              if(val[2][0][0] === TYPE_STRING){
                if(val[2][1][2].toLowerCase() === val[2][1][2].toUpperCase())
                  return `(${compileVal(val[2][0])})==${escapeStr(val[2][1][2])}`;
                else
                  return `(${compileVal(val[2][0])}).toLowerCase()==${escapeStr(val[2][1][2].toLowerCase())}`;
              } else {
                if(val[2][1][2].toLowerCase() === val[2][1][2].toUpperCase())
                  return `(${compileVal(val[2][0])}).toString()==${escapeStr(val[2][1][2].toLowerCase())}`;
                else
                  return `(${compileVal(val[2][0])}).toString().toLowerCase()==${escapeStr(val[2][1][2].toLowerCase())}`;
              }
            }

            if(safeCompare(val, 0))
              return `(${convertActualType(val[2][0], TYPE_FLOAT)})==(${convertActualType(val[2][1], TYPE_FLOAT)})`;

            if(val[2][0][0] === TYPE_FLOAT || val[2][0][0] === TYPE_NUMBER || val[2][0][0] === TYPE_INT){
              if(val[2][0][1] === null){
                if(isNaN(val[2][0][2]) || Math.abs(val[2][0][2]) === Infinity)
                  return `${escapeStr(val[2][0][2].toString().toLowerCase())}==((${convertActualType(val[2][1], TYPE_FLOAT)})+"").toLowerCase()`;
                else
                  return `${val[2][0][2]}==(${convertActualType(val[2][1], TYPE_FLOAT)})`;
              } else
                return `((${convertActualType(val[2][0], TYPE_FLOAT)})+"").toLowerCase()==((${convertActualType(val[2][1], TYPE_FLOAT)})+"").toLowerCase()`;
            }
            
            if(val[2][1][0] === TYPE_FLOAT || val[2][0][0] === TYPE_NUMBER || val[2][1][0] === TYPE_INT){
              if(val[2][1][1] === null){
                if(isNaN(val[2][1][2]) || Math.abs(val[2][1][2]) === Infinity)
                  return `((${convertActualType(val[2][0], TYPE_FLOAT)})+"").toLowerCase()==${escapeStr(val[2][1][2].toString().toLowerCase())}`;
                else
                  return `(${convertActualType(val[2][0], TYPE_FLOAT)})==${val[2][1][2]}`;
              } else
                return `((${convertActualType(val[2][0], TYPE_FLOAT)})+"").toLowerCase()==((${convertActualType(val[2][1], TYPE_FLOAT)})+"").toLowerCase()`;
            }
            
            return `${token_eq}(${compileVal(val[2][0])},${compileVal(val[2][1])})`;
          }

          case "operator_neq": {
            if(val[2][0][1] === null && isNum(val[2][0][2]) && Math.abs(+val[2][0][2]) != Infinity)
              return `${+val[2][0][2]}!=(${convertActualType(val[2][1], TYPE_FLOAT)})`;
            
            if(val[2][1][1] === null && isNum(val[2][1][2]) && Math.abs(+val[2][1][2]) != Infinity)
              return `(${convertActualType(val[2][0], TYPE_FLOAT)})!=${+val[2][1][2]}`;
            
            if(
              (
                val[2][0][1] === null &&
                val[2][0][0] === TYPE_STRING &&
                !isNum(val[2][0][2])
              )
            ){
              if(val[2][1][0] === TYPE_STRING){
                if(val[2][0][2].toLowerCase() === val[2][0][2].toUpperCase())
                  return `${escapeStr(val[2][0][2])}!=(${compileVal(val[2][1])})`;
                else
                  return `${escapeStr(val[2][0][2].toLowerCase())}!=(${compileVal(val[2][1])}).toLowerCase()`;
              } else {
                if(val[2][0][2].toLowerCase() === val[2][0][2].toUpperCase())
                  return `${escapeStr(val[2][0][2])}!=(${compileVal(val[2][1])}).toString()`;
                else
                  return `${escapeStr(val[2][0][2].toLowerCase())}!=(${compileVal(val[2][1])}).toString().toLowerCase()`;
              }
            }

            if(
              (
                val[2][1][1] === null &&
                val[2][1][0] === TYPE_STRING &&
                !isNum(val[2][1][2])
              )
            ){
              if(val[2][0][0] === TYPE_STRING){
                if(val[2][1][2].toLowerCase() === val[2][1][2].toUpperCase())
                  return `(${compileVal(val[2][0])})!=${escapeStr(val[2][1][2])}`;
                else
                  return `(${compileVal(val[2][0])}).toLowerCase()!=${escapeStr(val[2][1][2].toLowerCase())}`;
              } else {
                if(val[2][1][2].toLowerCase() === val[2][1][2].toUpperCase())
                  return `(${compileVal(val[2][0])}).toString()!=${escapeStr(val[2][1][2])}`;
                else
                  return `(${compileVal(val[2][0])}).toString().toLowerCase()!=${escapeStr(val[2][1][2].toLowerCase())}`;
              }
            }

            if(safeCompare(val, 1))
              return `(${convertActualType(val[2][0], TYPE_FLOAT)})!=(${convertActualType(val[2][1], TYPE_FLOAT)})`;
            
            if(val[2][0][0] === TYPE_FLOAT || val[2][0][0] === TYPE_NUMBER || val[2][0][0] === TYPE_INT){
              if(val[2][0][1] === null){
                if(isNaN(val[2][0][2]) || Math.abs(val[2][0][2]) === Infinity)
                  return `${escapeStr(val[2][0][2].toString().toLowerCase())}!=((${convertActualType(val[2][1], TYPE_FLOAT)})+"").toLowerCase()`;
                else
                  return `${val[2][0][2]}!=(${convertActualType(val[2][1], TYPE_FLOAT)})`;
              } else
                return `((${convertActualType(val[2][0], TYPE_FLOAT)})+"").toLowerCase()!=((${convertActualType(val[2][1], TYPE_FLOAT)})+"").toLowerCase()`;
            }
            
            if(val[2][1][0] === TYPE_FLOAT || val[2][0][0] === TYPE_NUMBER || val[2][1][0] === TYPE_INT){
              if(val[2][1][1] === null){
                if(isNaN(val[2][1][2]) || Math.abs(val[2][1][2]) === Infinity)
                  return `((${convertActualType(val[2][0], TYPE_FLOAT)})+"").toLowerCase()!=${escapeStr(val[2][1][2].toString().toLowerCase())}`;
                else
                  return `(${convertActualType(val[2][0], TYPE_FLOAT)})!=${val[2][1][2]}`;
              } else
                return `((${convertActualType(val[2][0], TYPE_FLOAT)})+"").toLowerCase()!=((${convertActualType(val[2][1], TYPE_FLOAT)})+"").toLowerCase()`;
            }
            
            return `${token_neq}(${compileVal(val[2][0])},${compileVal(val[2][1])})`;
          }

          case "operator_gt": {
            if(
              (
                val[2][0][1] === null &&
                val[2][0][0] === TYPE_STRING &&
                !isNum(val[2][0][2])
              )
            ){
              if(val[2][1][0] === TYPE_STRING){
                if(val[2][0][2].toLowerCase() === val[2][0][2].toUpperCase())
                  return `${escapeStr(val[2][0][2])}>(${compileVal(val[2][1])})`;
                else
                  return `${escapeStr(val[2][0][2].toLowerCase())}>(${compileVal(val[2][1])}).toLowerCase()`;
              } else {
                if(val[2][0][2].toLowerCase() === val[2][0][2].toUpperCase())
                  return `${escapeStr(val[2][0][2])}>(${compileVal(val[2][1])}).toString()`;
                else
                  return `${escapeStr(val[2][0][2].toLowerCase())}>(${compileVal(val[2][1])}).toString().toLowerCase()`;
              }
            }

            if(
              (
                val[2][1][1] === null &&
                val[2][1][0] === TYPE_STRING &&
                !isNum(val[2][1][2])
              )
            ){
              if(val[2][0][0] === TYPE_STRING){
                if(val[2][1][2].toLowerCase() === val[2][1][2].toUpperCase())
                  return `(${compileVal(val[2][0])})>${escapeStr(val[2][1][2])}`;
                else
                  return `(${compileVal(val[2][0])}).toLowerCase()>${escapeStr(val[2][1][2].toLowerCase())}`;
              } else {
                if(val[2][1][2].toLowerCase() === val[2][1][2].toUpperCase())
                  return `(${compileVal(val[2][0])}).toString()>${escapeStr(val[2][1][2])}`;
                else
                  return `(${compileVal(val[2][0])}).toString().toLowerCase()>${escapeStr(val[2][1][2].toLowerCase())}`;
              }
            }

            if(safeCompare(val, 2))
              return `(${convertActualType(val[2][0], TYPE_FLOAT)})>(${convertActualType(val[2][1], TYPE_FLOAT)})`;

            if(val[2][0][0] === TYPE_FLOAT && (val[2][1][0] === TYPE_NUMBER || val[2][1][0] === TYPE_INT || val[2][1][0] === TYPE_BOOLEAN))
              return `!((${convertActualType(val[2][0], TYPE_FLOAT)})<=(${convertActualType(val[2][1], TYPE_NUMBER)}))`;

            return `${token_gt}(${compileVal(val[2][0])},${compileVal(val[2][1])})`;
          }

          case "operator_geq": {
            if(
              (
                val[2][0][1] === null &&
                val[2][0][0] === TYPE_STRING &&
                !isNum(val[2][0][2])
              )
            ){
              if(val[2][1][0] === TYPE_STRING){
                if(val[2][0][2].toLowerCase() === val[2][0][2].toUpperCase())
                  return `${escapeStr(val[2][0][2])}>=(${compileVal(val[2][1])})`;
                else
                  return `${escapeStr(val[2][0][2].toLowerCase())}>=(${compileVal(val[2][1])}).toLowerCase()`;
              } else {
                if(val[2][0][2].toLowerCase() === val[2][0][2].toUpperCase())
                  return `${escapeStr(val[2][0][2])}>=(${compileVal(val[2][1])}).toString()`;
                else
                  return `${escapeStr(val[2][0][2].toLowerCase())}>=(${compileVal(val[2][1])}).toString().toLowerCase()`;
              }
            }

            if(
              (
                val[2][1][1] === null &&
                val[2][1][0] === TYPE_STRING &&
                !isNum(val[2][1][2])
              )
            ){
              if(val[2][0][0] === TYPE_STRING){
                if(val[2][1][2].toLowerCase() === val[2][1][2].toUpperCase())
                  return `(${compileVal(val[2][0])})>=${escapeStr(val[2][1][2])}`;
                else
                  return `(${compileVal(val[2][0])}).toLowerCase()>=${escapeStr(val[2][1][2].toLowerCase())}`;
              } else {
                if(val[2][1][2].toLowerCase() === val[2][1][2].toUpperCase())
                  return `(${compileVal(val[2][0])}).toString()>=${escapeStr(val[2][1][2])}`;
                else
                  return `(${compileVal(val[2][0])}).toString().toLowerCase()>=${escapeStr(val[2][1][2].toLowerCase())}`;
              }
            }

            if(safeCompare(val, 3))
              return `(${convertActualType(val[2][0], TYPE_FLOAT)})>=(${convertActualType(val[2][1], TYPE_FLOAT)})`;
            
            if(val[2][0][0] === TYPE_FLOAT && (val[2][1][0] === TYPE_NUMBER || val[2][1][0] === TYPE_INT || val[2][1][0] === TYPE_BOOLEAN))
              return `!((${convertActualType(val[2][0], TYPE_FLOAT)})<(${convertActualType(val[2][1], TYPE_NUMBER)}))`;
            
            return `${token_geq}(${compileVal(val[2][0])},${compileVal(val[2][1])})`;
          }

          case "operator_lt": {
            if(
              (
                val[2][0][1] === null &&
                val[2][0][0] === TYPE_STRING &&
                !isNum(val[2][0][2])
              )
            ){
              if(val[2][1][0] === TYPE_STRING){
                if(val[2][0][2].toLowerCase() === val[2][0][2].toUpperCase())
                  return `${escapeStr(val[2][0][2])}<(${compileVal(val[2][1])})`;
                else
                  return `${escapeStr(val[2][0][2].toLowerCase())}<(${compileVal(val[2][1])}).toLowerCase()`;
              } else {
                if(val[2][0][2].toLowerCase() === val[2][0][2].toUpperCase())
                  return `${escapeStr(val[2][0][2])}<(${compileVal(val[2][1])}).toString()`;
                else
                  return `${escapeStr(val[2][0][2].toLowerCase())}<(${compileVal(val[2][1])}).toString().toLowerCase()`;
              }
            }

            if(
              (
                val[2][1][1] === null &&
                val[2][1][0] === TYPE_STRING &&
                !isNum(val[2][1][2])
              )
            ){
              if(val[2][0][0] === TYPE_STRING){
                if(val[2][1][2].toLowerCase() === val[2][1][2].toUpperCase())
                  return `(${compileVal(val[2][0])})<${escapeStr(val[2][1][2])}`;
                else
                  return `(${compileVal(val[2][0])}).toLowerCase()<${escapeStr(val[2][1][2].toLowerCase())}`;
              } else {
                if(val[2][1][2].toLowerCase() === val[2][1][2].toUpperCase())
                  return `(${compileVal(val[2][0])}).toString().toLowerCase()<${escapeStr(val[2][1][2].toLowerCase())}`;
                else
                  return `(${compileVal(val[2][0])}).toString().toLowerCase()<${escapeStr(val[2][1][2].toLowerCase())}`;
              }
            }

            if(safeCompare(val, 4))
              return `(${convertActualType(val[2][0], TYPE_FLOAT)})<(${convertActualType(val[2][1], TYPE_FLOAT)})`;
            
            if(val[2][1][0] === TYPE_FLOAT && (val[2][0][0] === TYPE_NUMBER || val[2][0][0] === TYPE_INT || val[2][0][0] === TYPE_BOOLEAN))
              return `!((${convertActualType(val[2][0], TYPE_FLOAT)})>(${convertActualType(val[2][1], TYPE_NUMBER)}))`;
            
            return `${token_lt}(${compileVal(val[2][0])},${compileVal(val[2][1])})`;
          }

          case "operator_leq": {
            if(
              (
                val[2][0][1] === null &&
                val[2][0][0] === TYPE_STRING &&
                !isNum(val[2][0][2])
              )
            ){
              if(val[2][1][0] === TYPE_STRING){
                if(val[2][0][2].toLowerCase() === val[2][0][2].toUpperCase())
                  return `${escapeStr(val[2][0][2])}<=(${compileVal(val[2][1])})`;
                else
                  return `${escapeStr(val[2][0][2].toLowerCase())}<=(${compileVal(val[2][1])}).toLowerCase()`;
              } else {
                if(val[2][0][2].toLowerCase() === val[2][0][2].toUpperCase())
                  return `${escapeStr(val[2][0][2].toLowerCase())}<=(${compileVal(val[2][1])}).toString()`;
                else
                  return `${escapeStr(val[2][0][2].toLowerCase())}<=(${compileVal(val[2][1])}).toString().toLowerCase()`;
              }
            }

            if(
              (
                val[2][1][1] === null &&
                val[2][1][0] === TYPE_STRING &&
                !isNum(val[2][1][2])
              )
            ){
              if(val[2][0][0] === TYPE_STRING){
                if(val[2][1][2].toLowerCase() === val[2][1][2].toUpperCase())
                  return `(${compileVal(val[2][0])})<=${escapeStr(val[2][1][2])}`;
                else
                  return `(${compileVal(val[2][0])}).toLowerCase()<=${escapeStr(val[2][1][2].toLowerCase())}`;
              } else {
                if(val[2][1][2].toLowerCase() === val[2][1][2].toUpperCase())
                  return `(${compileVal(val[2][0])}).toString()<=${escapeStr(val[2][1][2])}`;
                else
                  return `(${compileVal(val[2][0])}).toString().toLowerCase()<=${escapeStr(val[2][1][2].toLowerCase())}`;
              }
            }

            if(safeCompare(val, 5))
              return `(${convertActualType(val[2][0], TYPE_FLOAT)})<=(${convertActualType(val[2][1], TYPE_FLOAT)})`;
            
            if(val[2][1][0] === TYPE_FLOAT && (val[2][0][0] === TYPE_NUMBER || val[2][0][0] === TYPE_INT || val[2][0][0] === TYPE_BOOLEAN))
              return `!((${convertActualType(val[2][0], TYPE_FLOAT)})>(${convertActualType(val[2][1], TYPE_NUMBER)}))`;
            
            return `${token_leq}(${compileVal(val[2][0])},${compileVal(val[2][1])})`;
          }


          case "operator_and":
            return `(${compileVal(val[2][0])})&&(${compileVal(val[2][1])})`;

          case "operator_or":
            return `(${compileVal(val[2][0])})||(${compileVal(val[2][1])})`;

          case "operator_not":
            return `!(${compileVal(val[2][0])})`;


          case "operator_length":
            return `(${compileVal(val[2][0])}).length`;

          case "operator_letter_of":
            if(val[2][0][1] === null)
              return `(${compileVal(val[2][1])})[${val[2][0][2] - 1}]??""`;

            return `(${compileVal(val[2][1])})[(${compileVal(val[2][0])})-1]??""`;

          case "operator_contains":
            if(val[2][0][1] === null){
              return `${escapeStr(val[2][0][2].toLowerCase())}.includes((${compileVal(val[2][1])}).toLowerCase())`;
            } else {
              if(val[2][1][1] === null){
                if(val[2][1][2].toLowerCase() === val[2][1][2].toUpperCase())
                  //Case doesn't matter, don't convert either
                  return `(${compileVal(val[2][0])}).includes(${escapeStr(val[2][1][2].toLowerCase())})`;
                else
                  return `(${compileVal(val[2][0])}).toLowerCase().includes(${escapeStr(val[2][1][2].toLowerCase())})`;
              } else
                return `(${compileVal(val[2][0])}).toLowerCase().includes((${compileVal(val[2][1])}).toLowerCase())`;
            }


          default:
            console.log(JSON.stringify(val, null, 2));
            throw new Error(`Failed to compile to JavaScript: Unknown operator IR '${val[1]}'`);
        }
      }
    }

    function compileScript(ir, idx, warp){
      let res = "";

      while(idx in ir){
        switch(ir[idx].type){
          //Event blocks
          case "event_broadcast":
            res += `${token_broadcast}(${compileVal(ir[idx].broad)});`;
            break;

          case "event_broadcastandwait":
            res += `yield*${token_broadcast_wait}(${compileVal(ir[idx].broad)});`;
            break;
          
          //Control blocks
          case "control_wait": {
            if(ir[idx].dur[1] === null && ir[idx].dur[2] === Infinity)
              //Wait forever
              res += `for(;;)yield;`;
            else {
              //Wait for a specific amount of time to pass
              if(ir[idx].dur[1] === null)
                res += `for(const _=Date.now();Date.now()-_<${1000 * ir[idx].dur[2]};)yield;`;
              else
                res += `for(const _=Date.now();Date.now()-_<1e3*(${compileVal(ir[idx].dur)});)yield;`;
            }
            break;
          }

          case "control_wait_until": {
            if(ir[idx].cond[1] === null && !ir[idx].cond[2])
              //Wait forever. Again.
              res += `for(;;)yield;`;
            else
              //Wait until a condition is met
              res += `while(${compileVal(optNot(ir[idx].cond))})yield;`;
            break;
          }

          case "control_create_clone_of": {
            //Unimplimented... kinda?
            res += `${token_create_clone}(${token_this});`;
            break;
          }

          case "control_delete_this_clone": {
            res += `${token_delete_clone}(${token_this});return;`;
            break;
          }

          case "control_if": {
            if(ir[idx].cond.length && ir[idx].sub.length){
              const cond = compileVal(ir[idx].cond, TYPE_BOOLEAN);

              //Newlines added for clarity -- To be removed in future
              if(cond && (typeof cond !== "object" || cond[2] != false))
                res += `if(${cond}){\n${compileScript(ir[idx].sub, 0, warp)}}`;
            }
            break;
          }

          case "control_if_else": {
            //Painful to understand, lots of possibilities to optimize
            if(ir[idx].cond.length){
              const cond = compileVal(ir[idx].cond, TYPE_BOOLEAN);

              if(ir[idx].sub.length){
                if(cond && (typeof cond !== "object" || cond[2] != false)){
                  if(ir[idx].sub2.length){
                    //Detect if it's better to switch the substacks
                    if(canOptNot(ir[idx].cond) > 0)
                      res += `if(${compileVal(optNot(ir[idx].cond), TYPE_BOOLEAN)}){\n${compileScript(ir[idx].sub2, 0, warp)}}else{${compileScript(ir[idx].sub, 0, warp)}}`;
                    else
                      res += `if(${cond}){\n${compileScript(ir[idx].sub, 0, warp)}}else{${compileScript(ir[idx].sub2, 0, warp)}}`;
                  } else {
                    //No second substack, just use a normal if statement
                    res += `if(${cond}){\n${compileScript(ir[idx].sub, 0, warp)}}`;
                  }
                } else if(ir[idx].sub2.length)
                  //Condition is false, just run second stack
                  res += compileScript(ir[idx].sub2, 0, warp);
              } else if(ir[idx].sub2.length)
                //Optimize the opposite of the condition and use a normal if statement
                res += `if(${compileVal(optNot(ir[idx].cond))}){\n${compileScript(ir[idx].sub2, 0, warp)}}`;
            } else if(ir[idx].sub2.length)
              //No condition, just run second stack
              res += compileScript(ir[idx].sub2, 0, warp);
            break;
          }

          case "control_repeat": {
            if(ir[idx].cond.length && ir[idx].sub.length){
              if(ir[idx].cond[1] === null && Math.round(ir[idx].cond[2]) == 1){
                res += `${compileScript(ir[idx].sub, 0, warp)}`;
                
                if(!warp)
                  res += `yield`;
              } else {
                const cond = compileVal(ir[idx].cond, TYPE_NUMBER);
  
                if(cond && (typeof cond !== "object" || cond[2] != false)){
                  //Lots of different way to represent the same things with different type knowledge
                  if(ir[idx].cond[1] === null)
                    res += `for(let _=0;_++<${Math.round(ir[idx].cond[2])};){\n${compileScript(ir[idx].sub, 0, warp)}`;
                  else if(ir[idx].cond[0] === TYPE_INT)
                    res += `for(let _=${cond};_-->0;){\n${compileScript(ir[idx].sub, 0, warp)}`;
                  else
                    res += `for(let _=${cond};_-->=.5;){\n${compileScript(ir[idx].sub, 0, warp)}`;
                }
  
                if(!warp)
                  res += `yield`;
                  
                res += `}`;
              }
            }
            break;
          }

          case "control_for_each": {
            if(ir[idx].val.length && ir[idx].sub.length){
              const cond = compileVal(ir[idx].val, TYPE_NUMBER);
              res += `for(let _=0;_++<${cond};){\n${convertVar(ir[idx].var)}=_;${compileScript(ir[idx].sub, 0, warp)}`;

              if(!warp)
                res += `yield`;

              res += `}`;
            }
            break;
          }

          case "control_while": {
            //Only continue if there is a condition and a substack
            if(ir[idx].cond.length){
              const cond = compileVal(ir[idx].cond, TYPE_BOOLEAN);

              //Only continue if the condition can be true
              if(cond && (typeof cond !== "object" || cond[2] != false)){
                if(ir[idx].sub.length){
                  res += `while(${cond}){\n${compileScript(ir[idx].sub, 0, warp)}`;

                  if(!warp)
                    res += `yield`;
  
                  res += `}`;
                } else
                  res += `while(${cond})yield;`; //Add a yield just to be nice to the user
              }
            }
            break;
          }

          case "control_forever": {
            if(ir[idx].sub.length){
              res += `for(;;){\n${compileScript(ir[idx].sub, 0, warp)}`;
  
              if(!warp)
                res += `yield`;
  
              res += `}`;
            } else
              res += `for(;;)yield;`; //To be nice to the user and let everything still run
            break;
          }


          case "control_stop": {
            switch(ir[idx].stop){
              case "all":
                //Remove all iterators and return
                res += `${token_iterators}=[];return;`;
                break;

              case "this script":
                //Simply return
                res += "return;";
                break;

                //TODO
//              case "other scripts in sprite":
//                res += `for(const _ in ${token_iterators})if(${token_iterators}[_][1]==${token_id})${token_iterators}.splice(_,1);`;
//                break;
            }

            break;
          }

          case "control_clear_counter":
            res += `${token_counter}=0;`;
            break;

          case "control_incr_counter":
            res += `${token_counter}++;`;
            break;


          //Motion blocks
          case "motion_setx": {
            res += `${token_gotoXY}(${token_this},${compileVal(ir[idx].val)},${token_this}.${token_y});`;
            break;
          }

          case "motion_changexby": {
            res += `${token_gotoXY}(${token_this},${token_this}.${token_x}+(${compileVal(ir[idx].val)}),${token_this}.${token_y});`;
            break;
          }

          case "motion_sety": {
            res += `${token_gotoXY}(${token_this},${token_this}.${token_x},${compileVal(ir[idx].val)});`;
            break;
          }

          case "motion_changeyby": {
            res += `${token_gotoXY}(${token_this},${token_this}.${token_x},${token_this}.${token_y}+(${compileVal(ir[idx].val)}));`;
            break;
          }

          case "motion_goto": { //TODO: Impliment. Shouldn't be too bad, at least for the non-variable case
            res += `${token_gotoXY}(${token_this},0,0);`;
            break;
          }

          case "motion_glidesecstoxy": {
            if(ir[idx].secs[1] === null){
              //If it would be instant
              if(ir[idx].secs[2] === 0){
                res += `${token_gotoXY}(${token_this},${compileVal(ir[idx].x)},${compileVal(ir[idx].y)});`;
                break;
              } else
                res += `for(let _=Date.now(),$=[${token_this}.${token_x},${token_this}.${token_y}],__=0;(__=(Date.now()-_)/(${1000 * ir[idx].secs[2]}))<1;)`;
            } else
              res += `for(let _=Date.now(),$=[${token_this}.${token_x},${token_this}.${token_y}],__=0;(__=(Date.now()-_)/1e3/(${compileVal(ir[idx].secs)}))<1;)`;

            //Complicated movement for gliding
            res += `${token_gotoXY}(${token_this},__*(${compileVal(ir[idx].x)})+(1-__)*$[0],__*(${compileVal(ir[idx].y)})+(1-__)*$[1]);`;
            res += `${token_gotoXY}(${token_this},${compileVal(ir[idx].x)},${compileVal(ir[idx].y)});`;
            break;
          }

          case "motion_gotoxy": {
            res += `${token_gotoXY}(${token_this},${compileVal(ir[idx].x)},${compileVal(ir[idx].y)});`;
            break;
          }

          case "motion_movesteps": {
            res += `${token_gotoXY}(${token_this},${token_this}.${token_x}+Math.sin(${token_this}.${token_dir})*(${compileVal(ir[idx].val)}),${token_this}.${token_y}+Math.cos(${token_this}.${token_dir})*(${compileVal(ir[idx].val)}));`;
            break;
          }

          case "motion_pointindirection": {
            if(ir[idx].dir[1] === null)
              res += `${token_this}.${token_dir}=` + (0.017453292519943295 * ((((ir[idx].dir[2] + 179) % 360 + 360) % 360) - 179));
            else
              res += `${token_this}.${token_dir}=0.017453292519943295*(modulo(((${compileVal(ir[idx].dir)})+179),360)-179);`;
            break;
          }

          case "motion_turnright": {
            res += `${token_this}.${token_dir}+=0.017453292519943295*(modulo(((${compileVal(ir[idx].val)})+179),360)-179);`;
            break;
          }

          case "motion_turnleft": {
            res += `${token_this}.${token_dir}-=0.017453292519943295*(modulo(((${compileVal(ir[idx].val)})+179),360)-179);`;
            break;
          }


          //Sensing blocks
          case "sensing_resettimer": {
            res += `${token_start}=Date.now();`;
            break;
          }

          case "sensing_askandwait": {
            res += `yield*${token_askWait}(${compileVal(ir[idx].quest)});`;
            break;
          }


          //Variable blocks
          //TODO: Impliment
          case "data_showvariable": {
            res += `;`;
            break;
          }

          case "data_hidevariable": {
            res += `;`;
            break;
          }

          case "data_addtolist": {
            const list = ir[idx].list[1];
            res += `${convertVar(list)}.push(${compileVal(ir[idx++].val)}`;

            //Optimize multiple "add to list"s into one function call
            while((idx in ir) && ir[idx].type === "data_addtolist" && ir[idx].list[1] === list)
              res += `,${compileVal(ir[idx++].val)}`;

            idx--;
            res += `);`;
            break;
          }

          case "data_insertatlist":
            res += `${token_listInsert}(${convertVar(ir[idx].list[1])},${compileVal(ir[idx].idx)},${compileVal(ir[idx].val)});`;
            break;

          case "data_replaceitemoflist":
            res += `${token_listReplace}(${convertVar(ir[idx].list[1])},${listIdx(convertVar(ir[idx].list[1]), ir[idx].idx)},${compileVal(ir[idx].val)});`;
            break;

          case "data_deleteoflist": {
            const list = convertVar(ir[idx].list[1]);

            if(ir[idx].idx[1] === null && ir[idx].idx[2] === "all")
              res += `${list}=[];`;
            else if(ir[idx].idx[1] === null && ir[idx].idx[2] === "last")
              res += `${list}.pop();`;
            else if(ir[idx].idx[1] !== null && (ir[idx].idx[0] === TYPE_STRING || ir[idx].idx[0] === TYPE_ANY))
              res += `${token_listDelete}(${list},${convertVar(ir[idx].idx)});`;
            else
              res += `${list}.splice(${listIdx(convertVar(ir[idx].list[1]), ir[idx].idx)},1);`;
            break;
          }

          case "data_deletealloflist":
            res += `${convertVar(ir[idx].list[1])}=[];`;
            break;

          //Doesn't actually do anything as of now
          case "data_showlist":
            res += `${token_showList}(${convertVar(ir[idx].list[1])});`;
            break;

          case "data_hidelist":
            res += `${token_hideList}(${escapeStr(ir[idx].list[1])});`;
            break;


          case "data_setvariableto":
            res += `${convertVar(ir[idx].var[1])}=${compileVal(ir[idx].val)};`;
            break;

          case "data_changevariableby": {
            const varName = convertVar(ir[idx].var[1]);

            //Only done for numbers, += is completely safe
            res += `${varName}+=${compileVal(ir[idx].val)};`;
            break;
          }


          //Looks blocks
          case "looks_show": {
            res += `${token_this}.${token_showing}=1;`;
            break;
          }

          case "looks_hide": {
            res += `${token_this}.${token_showing}=0;`;
            break;
          }

          //TODO: Impliment with sprite rendering
          case "looks_say": {
            res += `;`;
            break;
          }

          //Wait implimented, nothing else
          case "looks_sayforsecs": {
            res += `;`;
            if(ir[idx].dur[1] === null && ir[idx].dur[2] === Infinity)
              res += `for(;;)yield;`;
            else {
              res += `for(let _=Date.now();Date.now()-_<1e3*(${compileVal(ir[idx].dur)});)yield;`;
              res += `;`;
            }
            break;
          }

          case "looks_switchbackdropto": {
            res += `;`; //Temp (no backdrops exist)
            break;
          }

          //Impliment when backdrops exist. Yield put in.
          case "looks_switchbackdroptoandwait": {
            res += `yield;`;
            break;
          }

          //Sound blocks
          case "sound_setvolumeto": {
            res += `${token_this}.${token_volume}=${compileVal(ir[idx].sound)};`;
            break;
          }

          case "sound_changevolumeby": {
            res += `${token_this}.${token_volume}=Math.max(0,Math.min(100,${compileVal(ir[idx].sound)}));`;
            break;
          }

          //No actual sounds yet
          case "sound_play": {
            res += `;`;
            break;
          }

          //So this also does nothing
          case "sound_playuntildone": {
            res += `yield*${token_playFull}(${compileVal(ir[idx].sound)});`;
            break;
          }

          case "sound_seteffectto": {
            res += `;`;
            break;
          }


          //Procedure blocks
          case "procedures_call":
            if(commentBlocks[sprite].includes(ir[idx].proccode))
              break;

            if(!(ir[idx].proccode in customIDs[sprite])){
              console.warn(`Undefined custom block '${ir[idx].proccode}'`);
              break;
            }

            //TODO: Not force yield*
            res += `yield*${customIDs[sprite][ir[idx].proccode]}(`;

            for(const i in ir[idx].args){
              if(res[res.length - 1] !== "(")
                res += ",";

              const arg = ir[idx].args[i];
              
              //Should never apply for booleans
              if(arg[1] === null && (+arg[2]).toString() === arg[2].toString() && !Object.is(arg[2], -0))
                res += arg[2].toString();
              else
                res += compileVal(arg);
              }
            }

            res += ");";
            break;

          //Pen blocks
          case "pen_clear":
            res += `${token_pen_clear}();`;
            break;

          //TODO: Optimize knowledge of if pen is up or down
          case "pen_penDown":
            if(!((idx + 1) in ir) || ir[idx + 1].type !== "pen_penUp")
              res += `${token_this}.${token_penDown}=1;`
            else {
              res += `${token_this}.${token_penDown}=0;`
              idx++;
            }

            res += `${token_drawPen}(${token_this}.${token_x},${token_this}.${token_y},${token_this}.${token_x},${token_this}.${token_y},${token_this}.${token_penColor},${token_this}.${token_penAlpha},${token_this}.${token_penSize});`;
            break;

          case "pen_penUp":
            res += `${token_this}.${token_penDown}=0;`;
            break;

          //No sprites yet
          case "pen_stamp":
            res += `;`;
            break;


          case "pen_setPenColorParamTo":
            switch(ir[idx].param[2]){
              case "color":
                res += `${token_this}.${token_penColor}[0]=${compileVal(ir[idx].val)};`;
                break;

              case "saturation":
                if(ir[idx].val[1] === null)
                  res += `${token_this}.${token_penColor}[1]=${ir[idx].val[2] / 100};`;
                else
                  res += `${token_this}.${token_penColor}[1]=(${compileVal(ir[idx].val)})/100;`;
                break;

              case "brightness":
                if(ir[idx].val[1] === null)
                  res += `${token_this}.${token_penColor}[2]=${ir[idx].val[2] / 100};`;
                else
                  res += `${token_this}.${token_penColor}[2]=(${compileVal(ir[idx].val)})/100;`;
                break;

              case "transparency":
                if(ir[idx].val[1] === null)
                  res += `${token_this}.${token_penAlpha}=${1 - (ir[idx].val[2] / 100)};`;
                else
                  res += `${token_this}.${token_penAlpha}=1-(${compileVal(ir[idx].val)})/100;`;
                break;

              default:
                res += `;`;
            }
            break;

          case "pen_changePenColorParamBy":
            switch(ir[idx].param[2]){
              case "color":
                res += `${token_this}.${token_penColor}[0]+=${compileVal(ir[idx].val)};`;
                break;

              case "saturation":
                if(ir[idx].val[1] === null)
                  res += `${token_this}.${token_penColor}[1]=Math.min(100,Math.max(0,${token_this}.${token_penColor}[1]+(${ir[idx].val[2] / 100})));`;
                else
                  res += `${token_this}.${token_penColor}[1]=Math.min(100,Math.max(0,${token_this}.${token_penColor}[1]+(${compileVal(ir[idx].val[2])})/100));`;
                break;

              case "brightness":
                if(ir[idx].val[1] === null)
                  res += `${token_this}.${token_penColor}[2]=Math.min(100,Math.max(0,${token_this}.${token_penColor}[2]+(${ir[idx].val[2] / 100})));`;
                else
                  res += `${token_this}.${token_penColor}[2]=Math.min(100,Math.max(0,${token_this}.${token_penColor}[2]+(${compileVal(ir[idx].val[2])})/100));`;
                break;

              case "transparency":
                if(ir[idx].val[1] === null)
                  res += `${token_this}.${token_penAlpha}=Math.max(0,Math.min(1,${token_this}.${token_penAlpha}+${1 - (ir[idx].val[2] / 100)}));`;
                else
                  res += `${token_this}.${token_penAlpha}=Math.max(0,Math.min(1,1+${token_this}.${token_penAlpha}-(${compileVal(ir[idx].val)})/100));`;
                break;

              default:
                res += `;`;
            }
            break;

          case "pen_setPenSizeTo":
            res += `${token_this}.${token_penSize}=${compileVal(ir[idx].size, TYPE_NUMBER)};`;
            break;

          case "pen_changePenSizeBy":
            res += `${token_this}.${token_penSize}+=${compileVal(ir[idx].size, TYPE_NUMBER)};`;
            break;

          case "pen_setPenColorToColor": {
            if(ir[idx].col[1] === null){
              //Precomputing the values :)
              let col = ir[idx].col[2];

              if(!isNum(col) && col.startsWith?.("#")){
                col = col.slice(1, col.length);
                col = parseInt(col, 16);
              }
              col = +col;
              if(isNaN(col))
                col = 0;

              const colArr = [((col >> 16) & 255) / 255, ((col >> 8) & 255) / 255, (col & 255) / 255];
              const a = Math.max(...colArr);
              const b = a - Math.min(...colArr);
              const colHSV = [0, 0, 0];
              
              if(b){
                switch(a){
                  case colArr[0]:
                    colHSV[0] = 50 / 3 * (((colArr[1] - colArr[2]) / b) % 6);
                    break;

                  case colArr[1]:
                    colHSV[0] = 50 / 3 * ((colArr[2] - colArr[0]) / b + 2);
                    break;

                  case colArr[2]:
                    colHSV[0] = 50 / 3 * ((colArr[0] - colArr[1]) / b + 4);
                    break;
                }
              }
              colHSV[1] = (b / a) || 0;
              colHSV[2] = a;

              res += `${token_this}.${token_penColor}=${JSON.stringify(colHSV)};${token_this}.${token_penAlpha}=${(col >>> 24) & 0xff ? ((col >>> 24) & 0xff) / 0xff : 1};`;
              break;
            }

            //Otherwise value has to actually be computed
            const col = compileVal(ir[idx].col);

            //Is an intstr
            if(ir[idx].col[0] === TYPE_INT)
              res += `[${token_this}.${token_penColor},${token_this}.${token_penAlpha}]=${token_penColInt}(${col});`;
            else
              res += `[${token_this}.${token_penColor},${token_this}.${token_penAlpha}]=${token_penCol}(${col});`;

            break;
          }

          default:
            console.log(JSON.stringify(ir[idx], null, 2));
            console.log(res);
            throw new Error(`Failed to compile to JavaScript: Unknown IR opcode '${ir[idx].type}'`);
        }
        res += "\n";
        idx++;
      }
      return res;
    }

    res += `
${token_sprites}[${sprite}]=new (${token_spriteDefs}[${sprite}] = function(){
  const ${token_this} = this;
  const ${token_id} = ${sprite};
  const ${token_stage} = ${token_sprites}[0];`.replace(/(?<!(let|const|function|class))\s/g, "");

    res += `
  ${token_this}.${token_whenKey}={`;

    //Handle key press scripts
    let keys = {};
    for(const j in ir){
      if(ir[j][0].type === "event_whenkeypressed"){
        let key = ir[j][0].key.toUpperCase();
        
        key = {
          "LEFT ARROW": "ARROWLEFT",
          "SPACE": " ",
          "UP ARROW": "ARROWUP",
          "RIGHT ARROW": "ARROWRIGHT",
          "DOWN ARROW": "ARROWDOWN"
        }[key] ?? key;

        key = escapeStr(key);

        if(!(key in keys))
          keys[key] = [];
        
        keys[key].push(`function*(){\n${compileScript(ir[j], 1, false)}}`);
      }
    }

    for(const j in keys){
      if(res[res.length - 1] !== "{")
        res += ",";

      res += `${j}:[`;
      for(const k in keys[j]){
        if(res[res.length - 1] !== "[")
          res += ",";
        
        res += keys[j][k];
      }

      res += "]";
    }

    res += `
  };
  ${token_this}.${token_broad}={`;

    //Handle broadcast recieve scripts
    let broads = {};
    for(const j in ir){
      if(ir[j][0].type === "event_whenbroadcastreceived"){
        let broad = escapeStr(ir[j][0].broad).toLowerCase();

        if(!(broad in broads))
          broads[broad] = [];
        
        broads[broad].push(`function*(){\n${compileScript(ir[j], 1, false)}}`);
      }
    }

    for(const j in broads){
      if(res[res.length - 1] !== "{")
        res += ",";

      res += `${j}:[`;
      for(const k in broads[j]){
        if(res[res.length - 1] !== "[")
          res += ",";
        
        res += broads[j][k];
      }

      res += "]";
    }

    res += `
  };`;

    res += `self.${token_flag}=[`;
    
    //Handle flag clicks
    for(const j in ir){
      if(ir[j][0].type === "event_whenflagclicked"){
        if(res[res.length - 1] !== "[")
          res += ",";

        res += `function*(){\n${compileScript(ir[j], 1, false)}}`
      }
    }

    res += "];";

    //Handle custom blocks
    for(const j in ir){
      if(ir[j][0].type === "procedures_definition" && (ir[j].length > 1)){
        res += `const ${customIDs[sprite][ir[j][0].proccode]}=function*(`;

        argNames = ir[j][0].argNames;
        argTypes = ir[j][0].argTypes;

        token = startToken;
        argIDs = {};
        for(const k in argNames){
          if(res[res.length - 1] !== "(")
            res += ",";

          argIDs[argNames[k]] = "a" + k;
          res += argIDs[argNames[k]];
        }

        //TODO: Figure out how to make this not incorrect
//        res += `){${compileScript(ir[j], 1, ir[j][0].warp)}};`;
        res += `){\n${compileScript(ir[j], 1, true)}};`;
      }
    }

    //Handle variable definitions
    let initVars = "";
    for(const j in json.targets[i].variables){
        //These commented out sections cannot be used because hidden types still matter
/*
        if((+json.targets[i].variables[j][1]).toString() === json.targets[i].variables[j][1].toString())
          initVars += `let ${convertVar(j)}=${escapeVal(+json.targets[i].variables[j][1])};`;
        else
*/
        initVars += `let ${convertVar(j)}=${escapeVal(json.targets[i].variables[j][1])};`;
    }

    for(const j in json.targets[i].lists){
//      json.targets[i].lists[j][1] = json.targets[i].lists[j][1].map(x => ((+x).toString() === x.toString()) ? +x : x);
      initVars += `let ${convertVar(j)}=${JSON.stringify(json.targets[i].lists[j][1])};`;
    }

    //Variable declarations
    if(i == 0)
      init += initVars;
    else
      res += initVars;

    //Settings
    if(i != 0){ //Would use !== if i wasn't a string
      res += `${token_this}.${token_x}=${json.targets[i].x};`;
      res += `${token_this}.${token_y}=${json.targets[i].y};`;
      res += `${token_this}.${token_dir}=${json.targets[i].direction};`;
      res += `${token_this}.${token_showing}=${json.targets[i].visible};`;
      res += `${token_this}.${token_penDown}=0;`;
      res += `${token_this}.${token_penColor}=[200/3,1,1];`;
      res += `${token_this}.${token_penAlpha}=1;`;
      res += `${token_this}.${token_penSize}=2;`;
    }
    res += `${token_this}.${token_volume}=100;`;

    res += "});";


    if(i == 0)
      startVarToken = varToken;
  }

  //Finish tidying stuff up
  res += `flag()`;
  res = init + res;

  return res;
}
