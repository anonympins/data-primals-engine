import React, {
    forwardRef, useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import uniqid from "uniqid";
import cn from "classnames";
import { recursiveMap, useRefs } from "./Utils.jsx";
import {useTranslation} from "react-i18next";
import { CodeiumEditor } from "@codeium/react-code-editor";

import {debounce, escapeRegExp, isGUID, isLightColor} from "../../src/core.js";
import {mainFieldsTypes, maxFileSize} from "../../src/constants.js";
import {useModelContext} from "./contexts/ModelContext.jsx";
import {useQueryClient} from "react-query";
import {
    FaArrowDown,
    FaArrowUp, FaAt,
    FaCalendar, FaCalendarWeek, FaCode, FaFile,
    FaHashtag,
    FaImage,
    FaLink, FaListOl, FaListUl,
    FaLock, FaMinus,
    FaPallet, FaPhone, FaSitemap,
    FaToggleOn
} from "react-icons/fa";
import {FaCalendarDays, FaCodeCompare, FaPencil, FaT, FaTableColumns} from "react-icons/fa6";
import { CodeBlock, tomorrowNightBright } from 'react-code-blocks';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { docco } from 'react-syntax-highlighter/dist/esm/styles/hljs';

import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import CodeMirror, {basicSetup} from "@uiw/react-codemirror";
import {useAuthContext} from "./contexts/AuthContext.jsx";
import {maxStringLength} from "data-primals-engine/constants";

export const Form = ({
  name,
  onValidate,
  onError,
  children,
  editable,
  className = "",
}) => {
  const [childrenRef, registerRef] = useRefs();
  const onSubmit = (e) => {
    e.preventDefault();
    let res = true;
    Object.keys(childrenRef.current).forEach((item) => {
      res = childrenRef.current[item].validate() && res;
    });
    if (res) {
      if (onValidate) onValidate(e);
    } else {
      if (onError) onError();
    }
  };

  /**/
  return (
    <form
      name={name}
      noValidate={true}
      contentEditable={editable}
      className={cn({ ["form-" + name]: true }) + " " + (className || "")}
      onSubmit={onSubmit}
    >
      {recursiveMap(children, (child, index) => {
        /*if( child?.type?.displayName?.match(/(Field|RadioGroup)/)){
                        return <child.type {...child.props} ref={registerRef(child?.type?.displayName.concat('-').concat(child.props.name || uniqid()))} />
                    }*/
        return child;
      })}
    </form>
  );
};

const TextField = forwardRef(function TextField(
  {
    name,
    label,
    placeholder,
    help,
    editable,
    value,
    required,
    readOnly,
    onChange,
    multiline,
    minlength,
    maxlength,
    searchable,
      labelProps,
      showErrors=false,
    ...rest
  },
  ref,
) {
  const [id, setId] = useState("textfield-" + uniqid());
  const [errors, setErrors] = useState([]);
  const inputRef = useRef();

  const mult = typeof multiline !== 'undefined' ? multiline : maxlength > 255;
  const validate = () => {
    const errs = [];
    if (required && (!value || value.trim() === "")) {
      errs.push("Field required");
    }
    if (
      minlength > 0 &&
      typeof value == "string" &&
      value.trim().length < minlength
    ) {
      errs.push("Value length must be >= to " + minlength);
    }
    if (
      maxlength !== undefined && maxlength > 0 &&
      typeof value == "string" &&
      value.trim().length > maxlength
    ) {
      errs.push("Value length must be <= to " + maxlength);
    }
    if( showErrors )
        setErrors(errs);
    return !errs.length;
  };
  useImperativeHandle(ref, () => ({
    ref: inputRef.current,
    validate,
    getValue: () => value,
  }));
  const handleChange = (e) => {
    if (onChange) {
      onChange(e);
    }
  };
  useEffect(() => {
    if (value !== null) validate();
  }, [value]);
  return (
    <>
        <div
            className={cn({
                field: true,
                flex: true,
                "field-text": !mult,
                "field-multiline": mult,
            })}
        >
            {label && (
                <label
                    contentEditable={editable}
                    className={cn({help: !!help, 'flex-1': true})}
                    htmlFor={id}
                    {...labelProps}
                >
                    {label}
                    {required ? (
                        <span className="mandatory" contentEditable={false}>
                *
              </span>
                    ) : (
                        ""
                    )}
                </label>
            )}

            {help &&<div className="flex help">{help}</div>}

            {mult && (
                <textarea
                    ref={inputRef}
                    aria-required={required}
                    aria-readonly={readOnly}
                    readOnly={readOnly}
                    placeholder={placeholder}
                    id={id}
                    name={name}
                    value={value || ""}
                    rows={8}
                    onChange={handleChange}
                    minLength={minlength}
                    maxLength={maxlength}
                    {...rest}
                ></textarea>
            )}

            <div className={"flex flex-row flex-1 flex-start"}>
                {!mult && (
                    <input
                        ref={inputRef}
                        aria-required={required}
                        aria-readonly={readOnly}
                        readOnly={readOnly}
                        type={searchable ? "search" : "text"}
                        placeholder={placeholder}
                        title={placeholder}
                        alt={placeholder}
                        id={id}
                        name={name}
                        value={value || ""}
                        onChange={handleChange}
                        minLength={minlength}
                        maxLength={maxlength}
                        required={required}
                        {...rest}
                    />
                )}

            </div>
        </div>
        {errors.length > 0 && (
            <ul className="error">
          {errors.map((e, key) => (
            <li key={key} aria-live="assertive" role="alert">
              {e}
            </li>
          ))}
        </ul>
      )}
    </>
  );
});

TextField.displayName = "TextField";
export { TextField };

const EmailField = forwardRef(
  (
    {
      name,
      label,
      placeholder,
      help,
      editable,
      defaultValue,
      required,
      readOnly,
      onChange,
      minlength,
      maxlength,
      fieldValidated,
    },
    ref,
  ) => {
    const id = "emailfield-" + uniqid();
    const [errors, setErrors] = useState([]);
    const [value, setValue] = useState(defaultValue || null);
    const validate = () => {
      const errs = [];
      if (required && (!value || value.trim() === "")) {
        errs.push("Field required");
      }
      if (minlength !== undefined && minlength > 0 && value && value.trim().length < minlength) {
        errs.push("Value length must be >= to " + minlength);
      }
      if (maxlength !== undefined && maxlength > 0 && value && value.trim().length > maxlength) {
        errs.push("Value length must be <= to " + maxlength);
      }

    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errs.push("Invalid email");
      }
      setErrors(errs);
      return !errs.length;
    };
    useEffect(() => {
      if (value !== null) validate();
    }, [value]);
    useEffect(() => {
      if (fieldValidated) validate();
    }, [fieldValidated]);
    useImperativeHandle(ref, () => ({
      validate,
      getValue: () => value,
    }));
    const handleChange = (e) => {
      setValue(e.target.value);
      if (onChange) {
        onChange(e);
      }
    };
    return (
      <>
        <div className={cn({ field: true, "field-email": true })}>
          <label
            contentEditable={editable}
            className={cn({ help: !!help })}
            title={help}
            htmlFor={id}
          >
            {label}
            {required ? (
              <span className="mandatory" contentEditable={false}>
                *
              </span>
            ) : (
              ""
            )}
          </label>
          <input
            aria-required={required}
            aria-readonly={readOnly}
            readOnly={readOnly}
            type="email"
            placeholder={placeholder}
            id={id}
            name={name}
            value={value || ""}
            onChange={handleChange}
            minLength={minlength}
            maxLength={maxlength}
          />
        </div>
        {errors.length > 0 && (
          <ul className="error">
            {errors.map((e, key) => (
              <li key={key} aria-live="assertive" role="alert">
                {e}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  },
);
EmailField.displayName = "EmailField";
export { EmailField };

const NumberField = forwardRef(
  (
    {
      name,
      label,
      placeholder,
      help,
      editable,
      value,
      required,
      readOnly,
      onChange,
      minlength,
      maxlength,
      min,
      max,
      step,
        unit,
        ...rest
    },
    ref,
  ) => {
    const id = "numberfield-" + uniqid();
    const [errors, setErrors] = useState([]);
    const inputRef = useRef();
    const validate = () => {
      const errs = [];
      if (required && value === undefined) {
        errs.push("Field required");
      }
      if (minlength !== undefined && minlength > 0 && value && value.trim().length < minlength) {
        errs.push("Value length must be >= to " + minlength);
      }
      if (maxlength !== undefined && maxlength > 0 && value && value.trim().length > maxlength) {
        errs.push("Value length must be <= to " + maxlength);
      }
      if ((min || min === 0) && (value || value === 0) && min > value) {
        errs.push("Value < to " + min);
      }
      if ((max || max === 0) && (value || value === 0) && max < value) {
        errs.push("Value > to " + max);
      }
      setErrors(errs);
      return !errs.length;
    };
    useEffect(() => {
      if (value !== null) validate();
    }, [value]);
    useImperativeHandle(ref, () => ({
      ref: inputRef.current,
      validate,
      getValue: () => value,
    }));
    const handleChange = (e) => {
      if (onChange) {
        onChange(e);
      }
    };
    return (
      <>
        <div className={cn({ field: true, "field-number": true })}>

            <div className="flex flex-1">
                {label && (
                    <label
                        contentEditable={editable}
                        className={cn({ help: !!help })}
                        title={help}
                        htmlFor={id}
                    >
                        {label}
                        {required ? (
                            <span className="mandatory" contentEditable={false}>
                  *
                </span>
                        ) : (
                            ""
                        )}
                    </label>
                )}
                {help && <div className="flex help">{help}</div>}
          <input
            ref={inputRef}
            aria-required={required}
            aria-readonly={readOnly}
            readOnly={readOnly}
            type="number"
            placeholder={placeholder}
            id={id}
            name={name}
            value={value || ""}
            onChange={handleChange}
            minLength={minlength}
            maxLength={maxlength}
            min={min}
            max={max}
            step={step}
            {...rest}
          /><span className="unit">{unit}</span></div>
        </div>
        {errors.length > 0 && (
          <ul className="error">
            {errors.map((e, key) => (
              <li key={key} aria-live="assertive" role="alert">
                {e}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  },
);
NumberField.displayName = "NumberField";
export { NumberField };

const CheckboxField = forwardRef(
  (
    {
      name,
      label,
      placeholder,
      help,
      editable,
      defaultValue,
      required,
      readOnly,
      onChange,
      minlength,
      maxlength,
      checked,
        ...rest
    },
    ref,
  ) => {
    const id = "checkfield-" + uniqid();
    const [errors, setErrors] = useState([]);
    const [value, setValue] = useState(checked || false);
    useEffect(() => {
      setValue(checked);
    }, [checked]);
    const validate = () => {
      const errs = [];
      if (required && !value) {
        errs.push("Field must be checked.");
      }
      setErrors(errs);
      return !errs.length;
    };
    useEffect(() => {
      if (value !== null) validate();
    }, [value]);
    useImperativeHandle(ref, () => ({
      validate,
      getValue: () => value,
    }));
    const handleChange = (e) => {
      setValue(!value);
      onChange?.(e);
    };
    return (
        <>
            <div className={cn({field: true, "field-checkbox": true})}>
                <div className="inline"><input
                    aria-required={required}
                    aria-readonly={readOnly}
                    readOnly={readOnly}
                    type="checkbox"
                    checked={value}
                    placeholder={placeholder}
                    id={id}
                    name={name}
                    onChange={handleChange}
                    minLength={minlength}
                    maxLength={maxlength}
                    {...rest}
                />
                {label && (
                    <label
                        contentEditable={editable}
                        title={help}
                        htmlFor={id}
                    >
                        {label}
                        {required ? (
                            <span className="mandatory" contentEditable={false}>
                  *
                </span>
                        ) : (
                            ""
                        )}
                    </label>
                )}
                </div>
                {help && <div className="flex help">{help}</div>}
            </div>
            {errors.length > 0 && (
                <ul className="error">
                    {errors.map((e, key) => (
                        <li key={key} aria-live="assertive" role="alert">
                            {e}
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
  },
);
CheckboxField.displayName = "CheckboxField";
export { CheckboxField };

const RadioField = forwardRef(
  (
    {
      name,
      label,
      placeholder,
      help,
      editable,
      checked,
      required,
      readOnly,
      onChange,
      minlength,
      maxlength,
    },
    ref,
  ) => {
    const id = "radiofield-" + uniqid();
    const [errors, setErrors] = useState([]);
    const [value, setValue] = useState(checked || null);
    const validate = () => {
      const errs = [];
      if (required && !value) {
        errs.push("Field must be checked.");
      }
      setErrors(errs);
      return !errs.length;
    };
    useEffect(() => {
      if (value !== null) validate();
    }, [value]);
    useImperativeHandle(ref, () => ({
      validate,
      getValue: () => value,
    }));
    const handleChange = (e) => {
      setValue(!value);
      if (onChange) {
        onChange(e);
      }
    };
    return (
      <>
        <div className={cn({ field: true, "field-radio": true })}>
          <input
            aria-required={required}
            aria-readonly={readOnly}
            readOnly={readOnly}
            type="radio"
            checked={value}
            value={value || label}
            placeholder={placeholder}
            id={id}
            name={name}
            onChange={handleChange}
            minLength={minlength}
            maxLength={maxlength}
          />
          <label
            contentEditable={editable}
            className={cn({ help: !!help })}
            title={help}
            htmlFor={id}
          >
            {label}
            {required ? (
              <span className="mandatory" contentEditable={false}>
                *
              </span>
            ) : (
              ""
            )}
          </label>
        </div>
        {errors.length > 0 && (
          <ul className="error">
            {errors.map((e, key) => (
              <li key={key} aria-live="assertive" role="alert">
                {e}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  },
);
RadioField.displayName = "RadioField";
export { RadioField };

const SelectField = forwardRef(
  (
    {
      name,
      value,
      items,
      label,
      placeholder,
        disabled,
      help,
      editable,
      checked,
      required,
      readOnly,
      onChange,
      minlength,
      maxlength,
      multiple,
        ...rest
    },
    ref,
  ) => {
      const [values, setValues] = useState([]);
    const id = "selectfield-" + uniqid();
    const [errors, setErrors] = useState([]);
    const [_value, setValue] = useState(value);
    useEffect(() => {
        if( value === undefined && required && items[0]){
            setValue(items[0].value);
        }else {
            setValue(value);
            setValues(value)
        }
      if (!multiple && value) {
          //const index = items.findIndex((i) => i.value === value);
          //onChange({name, value:items[index]}, index);
      }
    }, [value]);
    const validate = () => {
      const errs = [];
      if (required && _value === undefined) {
        errs.push("Field is required.");
      }
      setErrors(errs);
      return !errs.length;
    };
    useEffect(() => {
      if (_value !== null) validate();
    }, [_value]);
    useImperativeHandle(ref, () => ({
      validate,
      getValue: () => _value,
      setValue,
    }));
    const handleChange = (e) => {
      setValue(e.target.value);
      if (onChange) {
            let options = e.target.options;
            let value = [];
            for (var i = 0, l = options.length; i < l; i++) {
              if (options[i].selected) {
                  value.push(options[i].value);
              }
            }
            if( multiple ) {
                setValues(value);
                onChange(value);
            }else {
                const index = items.findIndex((i) => i.value === e.target.value);
                onChange(items[index], index);
            }
      }
    };
    return (
      <>
        <div className={cn({ field: true, 'flex-1': true, flex: true, "field-select": true })}>
          {label && (
            <label
              contentEditable={editable}
              className={cn({ help: !!help, 'flex-1': true })}
              title={help}
              htmlFor={id}
            >
              {label}
              {required ? (
                <span className="mandatory" contentEditable={false}>
                  *
                </span>
              ) : (
                ""
              )}
            </label>
          )}
          <select
            aria-required={required}
            aria-readonly={readOnly}
            value={(_value)}
            id={id}
            name={name}
            onChange={handleChange}
            multiple={multiple}
            disabled={disabled}
            className={"flex-1"}
            {...rest}
          >
            {items.map((i) => (
              <option value={i.value}>{i.label}</option>
            ))}
          </select>
        </div>
        {help && <div className="flex help">{help}</div>}
        {errors.length > 0 && (
          <ul className="error">
            {errors.map((e, key) => (
              <li key={key} aria-live="assertive" role="alert">
                {e}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  },
);
SelectField.displayName = "SelectField";
export { SelectField };

const RadioGroup = forwardRef(
  ({ id, label, help, editable, name, required, children }, ref) => {
    const [childrenRef, registerRef] = useRefs();
    const [errors, setErrors] = useState([]);
    const validate = () => {
      const errs = [];
      let res = false;
      Object.keys(childrenRef.current).forEach((item) => {
        res = !!childrenRef.current[item].getValue() || res;
      });
      if (!res && required) {
        errs.push("Field is required");
      }
      setErrors(errs);
      return !errs.length;
    };
    useImperativeHandle(ref, () => ({
      validate,
    }));
    const handleChange = () => {
      setTimeout(() => validate(), 0);
    };
    return (
      <>
        <label
          contentEditable={editable}
          className={cn({ help: !!help })}
          title={help}
          htmlFor={children[0].props.id}
        >
          {label}
          {required ? (
            <span className="mandatory" contentEditable={false}>
              *
            </span>
          ) : (
            ""
          )}
        </label>
        {[
          recursiveMap(children, (child, index) => {
            if (child.type.displayName === "RadioField") {
              const props = {
                ...child.props,
                name: name ? name : child.props.name,
                onChange: () => handleChange(child.props.onChange),
              };
              return (
                <child.type
                  {...props}
                  ref={registerRef("Radio" + index)}
                  name={child.props.name || "btn" + id}
                />
              );
            }
            return child;
          }),
          errors.length > 0 ? (
            <ul className="error">
              {errors.map((e, key) => (
                <li key={key} aria-live="assertive" role="alert">
                  {e}
                </li>
              ))}
            </ul>
          ) : (
            <></>
          ),
        ]}
      </>
    );
  },
);

RadioGroup.displayName = "RadioGroup";
export { RadioGroup };

// New FileField component
const FileField = ({ inputProps, value, onChange, name, mimeTypes, maxSize, multiple}) => {
    const [fileInfos, setFileInfos] = useState(value);
    const { t } = useTranslation();

    const handleFileChange = (e) => {
        const selectedFiles = Array.from(e.target.files);
        const newFileInfos = [];

        const promises = selectedFiles.map(selectedFile => {
            if (selectedFile && selectedFile.size > (maxSize || maxFileSize)) {
                alert(`Le fichier est trop volumineux. La taille maximale autorisée est de ${(maxSize || maxFileSize) / (1024 * 1024)} Mo.`);
                e.target.value = '';
                return Promise.resolve();
            }
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    newFileInfos.push({
                        preview: reader.result,
                        newFile: true,
                        file: selectedFile,
                        name: selectedFile.name
                    });
                    resolve();
                };
                reader.readAsDataURL(selectedFile);
            });
        });

        Promise.all(promises).then(() => {
            if(!multiple){
                setFileInfos(newFileInfos);
            }else{
                setFileInfos(fileInfos => [...fileInfos, ...newFileInfos]);
            }
            onChange([...fileInfos.map(m => ({...m, newFile: false})), ...newFileInfos]);
        });
    };

    const handleRemove = (e, index) => {
        e.preventDefault();
        const newFileInfos = fileInfos.filter((_, i) => i !== index);
        setFileInfos(newFileInfos);
        onChange(newFileInfos.map(m => ({...m, newFile: false})));
    };

    useEffect(() => {
        if( value == null || (Array.isArray(value) && value.length === 0))
            setFileInfos([])
        else{
            const v = Array.isArray(value) ? value : [value];
            setFileInfos(v)
        }
    }, [value]);

    console.log(fileInfos)
    return (
        <div className="field field-file">
            <input
                id={"field-file-" + name}
                type="file"
                data-field={name}
                accept={mimeTypes ? mimeTypes.join(',') : '*'}
                onChange={handleFileChange}
                multiple={multiple} // Add multiple attribute
            />
            {fileInfos?.length > 0 && (
                <div>
                    {fileInfos.filter(f => isGUID(f.guid) || f.preview).map((fileInfo, index) => (
                        <div key={index}>
                            {fileInfo.preview ? (
                                <a href={fileInfo.preview} target="_blank" rel="noopener noreferrer">
                                    <img src={fileInfo.preview} alt={"Preview"} width='200' height='200' />
                                </a>
                            ) :(isGUID(fileInfo.guid) ? (
                                    <a href={"/resources/"+fileInfo.guid} target="_blank" rel="noopener noreferrer">
                                        <img src={"/resources/"+fileInfo.guid} alt={"Preview"} width='200' height='200' />
                                    </a>
                                ) :(
                                <img src={fileInfo.preview} alt="Preview" style={{ maxWidth: '200px', maxHeight: '200px' }} />
                            ))}
                            <button onClick={(e) => handleRemove(e, index)}><FaMinus /></button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export { FileField };

export const FilterNumberField = ({ model, field, onChangeFilterValue, filterValues, setFilterValues }) => {
    const { t } = useTranslation();
    const { models, setPage, dataByModel } = useModelContext(); // dataByModel is not used, consider removing
    const [min, setMin] = useState(null);
    const [max, setMax] = useState(null);

    // Debounced version of the function that actually calls onChangeFilterValue
    const debouncedApplyFilter = useCallback(
        debounce((currentMin, currentMax) => {
            const conditions = [];
            setPage(1);
            if (currentMin !== null && !isNaN(currentMin)) {
                conditions.push({ $gte: ['$' + field.name, parseFloat(currentMin)] });
            }
            if (currentMax !== null && !isNaN(currentMax)) {
                conditions.push({ $lte: ['$' + field.name, parseFloat(currentMax)] });
            }

            if (conditions.length > 0) {
                onChangeFilterValue(field, { $and: conditions });
            } else {
                onChangeFilterValue(field, {}); // Clear filter if both are invalid/null
            }
        }, 300), // Adjust delay as needed
        [field, onChangeFilterValue] // Dependencies for useCallback
    );

    useEffect(() => {
        // This effect is to reset local min/max if the global filterValues are cleared externally
        // It should not call debouncedApplyFilter directly if filterValues is the source of truth
        // for the parent component.
        if (filterValues && typeof filterValues[field.name] === 'object') {
            const andConditions = filterValues[field.name]?.$and;
            if (andConditions && Array.isArray(andConditions)) {
                const gteCondition = andConditions.find(cond => cond.$gte);
                const lteCondition = andConditions.find(cond => cond.$lte);
                setMin(gteCondition ? gteCondition.$gte[1] : null);
                setMax(lteCondition ? lteCondition.$lte[1] : null);
            } else {
                // If the structure is not $and or it's cleared
                setMin(null);
                setMax(null);
            }
        } else if (!filterValues || filterValues[field.name] === undefined || Object.keys(filterValues[field.name] || {}).length === 0) {
            // If filterValues for this field is cleared or doesn't exist
            setMin(null);
            setMax(null);
        }
    }, [filterValues, field.name]);


    const handleMinChange = (e) => {
        const inputValue = e.target.value;
        if (inputValue === "") {
            setMin(null);
            debouncedApplyFilter(null, max);
        } else {
            const pi = parseFloat(inputValue); // Use parseFloat for potentially decimal numbers
            if (!isNaN(pi)) {
                setMin(pi);
                debouncedApplyFilter(pi, max);
            } else {
                setMin(inputValue); // Keep invalid input in state to show user, but don't filter
                // Or setMin(null) if you want to clear on invalid
                // Potentially call debouncedApplyFilter(null, max) if invalid min means no min filter
            }
        }
        gtag('event', 'search (number,min)');
    };

    const handleMaxChange = (e) => {
        const inputValue = e.target.value;
        if (inputValue === "") {
            setMax(null);
            debouncedApplyFilter(min, null);
        } else {
            const pi = parseFloat(inputValue);
            if (!isNaN(pi)) {
                setMax(pi);
                debouncedApplyFilter(min, pi);
            } else {
                setMax(inputValue);
                // Potentially call debouncedApplyFilter(min, null) if invalid max means no max filter
            }
        }
        gtag('event', 'search (number,max)');
    };

    return (
        <>
            <NumberField
                value={min === null ? '' : min} // Handle null for empty display
                label="Min:"
                onChange={handleMinChange}
                type="number" // Ensure type is number for appropriate input behavior
            />
            <NumberField
                value={max === null ? '' : max} // Handle null for empty display
                label="Max:"
                onChange={handleMaxChange}
                type="number" // Ensure type is number
            />
        </>
    );
};

export const FilterEnumField = ({model, field, onChangeFilterValue, filterValues, setFilterValues}) => {
    const {t} = useTranslation();
    const debounced = debounce((field,filter) => onChangeFilterValue(field, { $find: filter }));
    const { models, setPage, elementsPerPage,pagedFilters, pagedSort, page       } = useModelContext();

    const [val, setVal] = useState(null);
    const queryClient= useQueryClient()

    useEffect(() => {
        if (Object.keys(filterValues).length === 0){
            onChangeFilterValue(field, { });
            setVal('');
        }
    }, [filterValues]);

    return <div className={"flex flex-no-gap flex-no-wrap"}><SelectField value={val} className={"flex-1"} items={['', ...(field.items || [])].map(m => ({label: t(m), value: m}))} onChange={(e) => {

        setPage(1);

        if( !e || e.value === '') {
            setVal('');
            onChangeFilterValue(field, undefined);
        }
        else {
            onChangeFilterValue(field, {$eq: ['$' + field.name, e.value]});
            setVal(e.value);
        }

        gtag('event', 'search (enum)');
        queryClient.invalidateQueries(['api/data', model.name, 'page', page, elementsPerPage, elementsPerPage, pagedFilters[model.name], pagedSort[model.name]]);
    }} /><button onClick={() => {
        onChangeFilterValue(field, { });
        setVal('');
    }}>x</button></div>
}
export const FilterBooleanField = ({model, field, filterValues, onChangeFilterValue  }) => {
    const {t} = useTranslation();
    const { setPage, pagedFilters, pagedSort, page,elementsPerPage } = useModelContext();

    useEffect(() => {
        if( Object.keys(filterValues).length === 0 ){
            setVal('null');
            onChangeFilterValue(field, { });
        }
    }, [filterValues]);
    const [val, setVal] = useState(null);
    const queryClient= useQueryClient()
    return <div className={"flex flex-no-gap flex-no-wrap"}><SelectField value={val} className={"flex-1"} items={[
        {label: t(''), value: 'null'},
        {label: t('yes'), value: '1'},
        { label: t('no'), value: '0'}]}
         onChange={(e) => {
             setPage(1);
             if( !e || e.value === 'null') {
                 setVal(null);
                 onChangeFilterValue(field, { });
             }
             else {
                 onChangeFilterValue(field, {$or: [{$eq: ['$' + field.name, e.value === '1']}, {$eq: [{ $type: '$'+field.name }, "missing"]}]});
                 setVal(e.value);
             }

             gtag('event', 'search (boolean)');
             queryClient.invalidateQueries(['api/data', model.name, 'page', page, elementsPerPage, pagedFilters[model.name], pagedSort[model.name]]);
         }} /></div>
}
export const FilterDateField = ({model, field, filterValues, onChangeFilterValue  }) => {
    const {t} = useTranslation();

    const [minDate ,setMinDate] = useState(null);
    const [maxDate ,setMaxDate] = useState(null);
    useEffect(() => {
        if( Object.keys(filterValues).length === 0 ){
            onChangeFilterValue(field, { });
            setMinDate('');
            setMaxDate('');
        }
    }, [filterValues]);
    const onChange =  (minDate, maxDate) =>{
        const min = minDate ? { $gte: ['$'+field.name, minDate]}  : null;

        const fm = new Date(maxDate);
        fm.setDate(fm.getDate() + 1);

        const max = maxDate ? {$lte: ['$' + field.name, fm.toISOString()]} : null;
        const and= [];
        if( min) and.push(min);
        if( max) and.push(max);
        if( !min && !max)
            onChangeFilterValue(field, { });
        else
            onChangeFilterValue(field, { $and: and});
        gtag('event', 'search (date)');
    }
    return <div className={"flex flex-no-gap flex-no-wrap"}>
        <label htmlFor={"minDate"+model.name+field.name}>
            Min:
            <input id={"minDate"+model.name+field.name} type={"datetime-local"} value={minDate} onChange={e => {
                setMinDate(e.target.value);
                onChange?.(e.target.value, maxDate);
            }} />
        </label>
        <label htmlFor={"maxDate"+model.name+field.name}>
            Max:
            <input id={"maxDate"+model.name+field.name} type={"datetime-local"} value={maxDate} onChange={e => {
                setMaxDate(e.target.value);
                onChange?.(minDate, e.target.value);
            }} />
        </label>
    </div>
}
export const FilterStringField = ({ field, onChangeFilterValue, filterValues, setFilterValues }) => {
    const { models, setPage } = useModelContext();
    const [isRegex, setIsRegex] = useState(false);
    const { t } = useTranslation();


    useEffect(() => {
        if( Object.keys(filterValues).length === 0 ){
            onChangeFilterValue(field, { });
        }
    }, [filterValues]);

    // Debounced function to apply the filter
    const debouncedApplyFilter = useCallback(
        debounce((currentValue, currentIsRegex) => {
            setPage(1); // Reset page to 1 when filter changes

            if (currentValue === '') {
                // No need to call setFilterValues here as it's done immediately in handleChange
                onChangeFilterValue(field, field.multiple ? [] : undefined, true);
                return;
            }

            let filterQuery;
            if (field.type === 'relation') {
                const relationModel = models.find(f => f.name === field.relation);
                if (relationModel) {
                    const relationFilters = relationModel.fields
                        .filter(f => mainFieldsTypes.includes(f.type))
                        .map(mf => ({
                            $regexMatch: { input: `$$this.${mf.name}`, regex: currentIsRegex ? currentValue : escapeRegExp(currentValue) }
                        }));
                    if (relationFilters.length > 0) {
                        filterQuery = { [field.name]: {$find: { $and: [{ $or: relationFilters }] }}};
                    } else {
                        filterQuery = {}; // Or handle as no match if no searchable fields
                    }
                } else {
                    filterQuery = {}; // Relation model not found
                }
            } else { // Not a relation type
                const regexToUse = currentIsRegex ? currentValue : escapeRegExp(currentValue);
                if (field.type === 'array') {
                    filterQuery = {
                        $gt: [
                            {
                                $size: {
                                    $filter: {
                                        input: '$' + field.name,
                                        as: 'item',
                                        cond: {
                                            $regexMatch: {
                                                input: '$$item',
                                                regex: regexToUse
                                            }
                                        }
                                    }
                                }
                            },
                            0
                        ]
                    };
                } else { // Simple string field
                    filterQuery = {
                        $and: [{
                            $regexMatch: {
                                input: '$' + field.name,
                                regex: regexToUse
                            }
                        }]
                    };
                }
            }
            onChangeFilterValue(field, filterQuery, true);
            gtag('event', 'search (string)');
        }, 1200), // Debounce delay
        [] // Dependencies for useCallback
    );

    const handleInputChange = (e) => {
        const newValue = e.target.value;
        // Update the displayed value immediately
        setFilterValues(filter => ({ ...filter, [field.name]: newValue }));
        // Call the debounced function to apply the filter
        debouncedApplyFilter(newValue, isRegex);
    };

    const handleToggleRegex = () => {
        const newIsRegex = !isRegex;
        setIsRegex(newIsRegex);
        // Re-apply filter with the new regex state and current value
        // The value from filterValues should be up-to-date
        const currentValue = filterValues[field.name] || '';
        debouncedApplyFilter(currentValue, newIsRegex);
    };

    return (
        <>
            <TextField
                type="text"
                name={`filter_${field.name}`}
                value={filterValues[field.name] || ''} // Ensure controlled component with a default empty string
                placeholder={isRegex ? t("filterstringfield.placeholder.regex", "regular expression") : t("filterstringfield.placeholder", "...")}
                onChange={handleInputChange}
                maxLength={1000}
            />
            <button title={"regex"} className={isRegex ? 'active' : ''} onClick={handleToggleRegex}>.*</button>
        </>
    );
};
export const FilterField = ({model, reversed, field, active, onChangeFilterValue, filterValues, setFilterValues}) => {
    const { elementsPerPage, pagedSort, setPagedSort, setPage, page, pagedFilters, lockedColumns, setLockedColumns } = useModelContext();
    const {t} = useTranslation();
    const [locked, setLocked] = useState(lockedColumns.includes(field.name));
    const queryClient = useQueryClient()

    useEffect(() => {
        if(!reversed) {
            setFilterValues(filter => ({...filter, [field.name]: ''}));
            onChangeFilterValue(field, '', true);
        }
    }, [field]);

    const handleToggleLock = () => {
        if( locked ) {
            if (lockedColumns.includes(field.name))
                setLockedColumns(cols => [...cols].filter(f => f !== field.name));
        }else{
            if (!lockedColumns.includes(field.name))
                setLockedColumns(cols => [...cols, field.name]);
        }
        setLocked(!locked);
    }

    const [reset, setReset] = useState(false);
    const handleChangeSort = (up) => {
        setPagedSort(sort => {
            const s = lockedColumns.length > 0 ? {...sort[model.name] || {}} : {};
            if( up ){
                if( reset ){
                    delete s[field.name];
                    setReset(false);
                }else {
                    s[field.name] = 1;
                }
            }else{
                s[field.name] = -1;
                setReset(true);
            }
            return {...sort, [model.name]: s};
        });
        queryClient.invalidateQueries(['api/data', model.name, 'page', page, elementsPerPage, pagedFilters[model.name], pagedSort[model.name]]);
    }

    const resetClass = pagedSort[model.name]?.[field.name] ? (((pagedSort[model.name]?.[field.name] === 1) || (pagedSort[model.name]?.[field.name] === -1)) ? 'active' : 'reset') : '';

    const renderIconFromType =(field)=>{
        const type = field.type;
        if( type === 'color'){
            return <FaPallet/>;
        }
        if( type === 'code'){
            return <FaCode />;
        }
        else if( type === 'date'){
            return <FaCalendarWeek />;
        }else if( type === 'datetime'){
            return <FaCalendarDays />;
        }
        else if( type === 'richtext' || type === 'string' || type === 'string_t'){
            return <></>;
        }
        else if( type === 'url'){
            return <FaLink />;
        }
        else if( type === 'number'){
            return <FaHashtag />;
        }
        else if( type === 'file'){
            return <FaFile />;
        }
        else if( type === 'enum'){
            return <FaListUl />;
        }
        else if( type === 'boolean'){
            return <FaToggleOn />;
        }
        else if( type === 'image'){
            return <FaImage/>;
        }
        else if( type === 'relation'){
            return field.multiple ? <FaSitemap /> : <FaLink />;
        }
        else if( type === 'email'){
            return <FaAt />;
        }
        else if( type === 'phone'){
            return <FaPhone />;
        }
        else if( type === 'array'){
            return <FaTableColumns />;
        }
        return <FaPencil />
    }
    return <th key={field.name} className={`form filter-field`} style={{backgroundColor: field.color, color: !field.color ||isLightColor(field.color) ? 'black': "white"}}>
        <div className="flex flex-centered flex-mini-gap flex-row">
            <div className="flex flex-1 flex-mini-gap flex-no-wrap">
                {renderIconFromType(field)}
                <span title={field.name} className={"flex-1 title"}>{t(`field_${model.name}_${field.name}`, field.name)}</span>
            </div>
            { 'password'!==field.type && (<div className={"flex flex-no-gap"}>
                {(<>
                        {(pagedSort[model.name]?.[field.name] !== 1) &&
                            <button onClick={() => handleChangeSort(true)}
                                    className={resetClass}>
                                {pagedSort[model.name]?.[field.name] === undefined ? <FaArrowDown/> : <FaArrowUp/>}</button>}
                        {(pagedSort[model.name]?.[field.name] === 1) &&
                            <button onClick={() => handleChangeSort(false)}
                                    className={resetClass}>
                                <FaArrowDown/></button>}
                    </>
                )}
                {!field.unique && (
                    <button onClick={() => handleToggleLock()} className={locked ? 'active' : ''}><FaLock/></button>)}
            </div>)}
            {active && !['date','datetime','enum', 'boolean', 'number', 'password'].includes(field.type) && <div className="filter flex flex-no-wrap flex-mini-gap">
                <FilterStringField setFilterValues={setFilterValues} filterValues={filterValues} field={field} onChangeFilterValue={onChangeFilterValue} />
            </div>}
            {active && field.type === 'enum' && <div className="filter flex flex-no-wrap flex-mini-gap">
                <FilterEnumField model={model} setFilterValues={setFilterValues} filterValues={filterValues} field={field} onChangeFilterValue={onChangeFilterValue} />
            </div>}
            {active && field.type === 'boolean' && <div className="filter flex flex-no-wrap flex-mini-gap">
                <FilterBooleanField filterValues={filterValues} model={model} field={field} onChangeFilterValue={onChangeFilterValue} />
            </div>}
            {active && ['date', 'datetime'].includes(field.type) && <div className="filter flex flex-no-wrap flex-mini-gap">
                <FilterDateField filterValues={filterValues} model={model} field={field} onChangeFilterValue={onChangeFilterValue} />
            </div>}
            {active && field.type === 'number' && <div className="filter flex flex-no-wrap flex-mini-gap">
                <FilterNumberField model={model} setFilterValues={setFilterValues} filterValues={filterValues} field={field} onChangeFilterValue={onChangeFilterValue} />
            </div>}
        </div>
    </th>
}

export const PhoneField = ({name, value, onChange}) => {
    const [phone, setPhone] = useState(value);
    useEffect(() => {
        setPhone(value);
    }, [value]);
    return (
        <div>
            <PhoneInput
                defaultCountry="ua"
                value={phone || ''}
                onChange={(phone) => {
                    setPhone(phone);
                    onChange?.(phone);
                }}
            />
        </div>
    );
}

export const ModelField = ({field, disableable=false, showModel=true, value, fieldValue, fields=false, onChange}) => {
    const {models} = useModelContext();
    const {me} = useAuthContext();
    const {t} = useTranslation()
    const [modelValue, setModelValue] = useState(value);
    const [modelFieldValue, setModelFieldValue] = useState(null);
    const [checked, setChecked] = useState(true);

    const itemsFields = [...models.find(f=>f.name === modelValue && me?.username === f._user)?.fields.map(m => ({label: m.name, value: m.name})) || []];

    useEffect(() => {
        console.log({value})
        setModelValue(value)
    }, [value]);

    useEffect(() => {
        console.log(modelValue)
        onChange({name: field.name, value: modelValue});
    }, [modelValue]);

    useEffect(() => {
        if( !fieldValue){
            setModelFieldValue(itemsFields.length > 0 ? itemsFields[0].value : null)
        }else
            setModelFieldValue(fieldValue)
    }, [fieldValue]);

    const dis = disableable ? <><CheckboxField checked={checked} onChange={e => {
        setChecked(e.target.checked)
        if (!e.target.checked) {
            setModelValue(null);
        }
    }} /></> : null;

    if( !fields )
        return <div className={"flex flex-1"}>
        {dis}{checked && (<SelectField className="flex-1" value={modelValue} onChange={(e) => {
            setModelValue(e.value)
            onChange({name: field.name, value: e.value});
        }} items={[...models.filter(f=>f._user === me?.username).map(m => ({label: t(`model_${m.name}`, m.name), value: m.name}))]}/>
            )}
    </div>;
    return <div className={"flex flex-1"}>{dis}{checked && (<div className="flex flex-stretch" key={field?.name??'def'}>
        {showModel && (<SelectField disabled={!!checked} className="flex-1" value={modelValue} onChange={(e) => {
            setModelValue(e.value)
            onChange({name: field.name, value: { model: e.value, field: itemsFields[0] }});
        }} items={[...models.filter(f=>f._user === me?.username).map(m => ({label: t(`model_${m.name}`, m.name), value: m.name}))]}/>
            )}
        <SelectField className="flex-1" value={modelFieldValue} onChange={(e) =>{
            setModelFieldValue(e.value)
            onChange({name: field.name, value: { model: modelValue, field:e.value}});
        }} items={itemsFields}/>
    </div>)}
    </div>
}
export const ColorField = ({name, label, value, disabled, onChange, className, ...rest}) => {
    // 1. État interne pour une réactivité immédiate de l'interface.
    const [internalValue, setInternalValue] = useState(value);

    // 2. On mémoïze le gestionnaire d'événements avec debounce pour éviter de le recréer à chaque rendu.
    const debouncedOnChange = useCallback(
        debounce((newValue) => {
            // On notifie le parent du changement après un court délai.
            onChange?.({ name, value: newValue });
        }, 200), // Un délai de 200ms est confortable pour un sélecteur de couleur.
        [onChange, name] // Dépendances de useCallback
    );

    // 3. Effet pour synchroniser l'état interne si la prop `value` du parent change.
    useEffect(() => {
        if (value !== internalValue) {
            setInternalValue(value);
        }
    }, [value]);

    const handleChange = (e) => {
        const newValue = e.target.value;
        // Met à jour l'état interne instantanément pour que l'input soit réactif.
        setInternalValue(newValue);
        // Appelle la fonction "debounced" pour notifier le parent.
        debouncedOnChange(newValue);
    };

    return (
        <div className={`flex flex-1  flex-no-wrap ${className || ''}`}>
            {label && (<label className="flex-1">{label}</label>)}
            <div className="flex flex-1 flex-no-wrap"><input
                disabled={disabled}
                type="color"
                // L'input est maintenant contrôlé par notre état interne.
                value={internalValue || '#FFFFFF'}
                onChange={handleChange}
                {...rest}
            />
            <span className="color-value">{internalValue || '#FFFFFF'}</span>
            </div>
        </div>
    );
};

export const CodeField = ({name, label, language, value, disabled, onChange}) => {
    const u = name || uniqid();
    const [currentEditor, setEditor] = useState(null);

    return <>
        {label && (<label className="flex flex-1">{label}</label>)}
        {!disabled ? <div className={"codefield"}><span><b>{language}</b> : </span><CodeiumEditor
            language={language || 'json'}
            theme={"vs-dark"}
            value={value}
            onChange={e => {
                if (language === 'json') {
                    let code;
                    try {
                        code = JSON.parse(e);
                        onChange({name, value: code});
                    } catch (e) {
                    }
                } else
                    onChange({name, value: e});
            }}
            height="300px"
        /></div> : <div className="code"><SyntaxHighlighter
            language={language || "javascript"} theme={docco}>{value}</SyntaxHighlighter></div>
        }</>
}

export const EnumField = ({inputProps, value, handleChange, field}) => {
    const { t} = useTranslation()
    useEffect(() => {
        if( field.items.includes(value))
            handleChange(value);
        else{
            handleChange({name: field.name, value: field.items[0]})
        }
    }, []);
    return (
        <select {...inputProps} onChange={(e) => handleChange({name: field.name, value: e.target.value})} >{(field.items || []).map(item => {
            if( typeof(item) === 'string'){
                return <option value={item}>{t(item, item)}</option>;
            }
            return <></>
        })}</select>
    );
}
