import Button from "./Button.jsx";
import { FaWindowClose } from "react-icons/fa";

import "./Dialog.scss";
import { createContext, useContext, useEffect, useState } from "react";
import {useUI} from "./contexts/UIContext.jsx";

const DialogContext = createContext({});

export const useDialogContext = () => useContext(DialogContext);

export const DialogProvider = ({ children }) => {
  const [dialogs, setDialogs] = useState(0);
  const { locked, setLocked } = useUI()
  const values = {
    addDialog: () => setDialogs((dialogs) => dialogs + 1),
    removeDialog: () =>
      setDialogs((dialogs) => {
        return dialogs > 0 ? dialogs - 1 : 0;
      }),
  };
  useEffect(() => {
    if( dialogs === 0){
      setLocked(false);
    }else{
      setLocked(true);
    }
  }, [dialogs]);
  return (
    <DialogContext.Provider value={values}>
      {dialogs > 0 ? (
        <>
          <div className="dialog-bg"></div>
          {children}
        </>
      ) : (
        children
      )}
    </DialogContext.Provider>
  );
};
export const Dialog = ({
  title,
  children,
  className,
  onClose,
  isClosable,
  isModal,
}) => {
  const [showModal, setModalVisible] = useState(true);
  const { addDialog, removeDialog } = useDialogContext();
  const handleClose = () => {
    setModalVisible(false);
    onClose?.();
    removeDialog();
  };
  const clickEvent = (e) => {

    if( !e.target.closest('.dialog') && !e.target.closest('.notification') ){
      onClose?.();
    }
  };
  useEffect(() => {
    addDialog();
    document.addEventListener('mousedown', clickEvent);
    return () => {
      removeDialog();
      document.removeEventListener('mousedown', clickEvent);
    }
  }, [addDialog, removeDialog]);
  return showModal ? (
    <div
        aria-modal={true}
        aria-label={title}
      className={`${className ? className : ""} dialog ${isModal ? "dialog-modal" : ""}`}
    >
      <div className="dialog-header">
        {title && <h2>{title}</h2>}
        {isClosable && (
          <Button className={"btn btn-close"} onClick={handleClose}>
            <FaWindowClose />
          </Button>
        )}
      </div>
      <div className="dialog-content">{children}</div>
    </div>
  ) : (
    <></>
  );
};
