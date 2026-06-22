// Inspired by react-hot-toast library
import { useState, useEffect } from "react";

const TOAST_LIMIT = 20;
const TOAST_REMOVE_DELAY = 5000;

export const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
};

let count = 0;

function genId() {
  return (++count).toString();
}

const toastTimeouts = new Map();

function addToRemoveQueue(toastId) {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);

    dispatch({
      type: actionTypes.REMOVE_TOAST,
      toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
}

function clearFromRemoveQueue(toastId) {
  const timeout = toastTimeouts.get(toastId);

  if (timeout) {
    clearTimeout(timeout);
    toastTimeouts.delete(toastId);
  }
}

export const reducer = (state, action) => {
  switch (action.type) {
    case actionTypes.ADD_TOAST:
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case actionTypes.UPDATE_TOAST:
      return {
        ...state,
        toasts: state.toasts.map((toast) =>
          toast.id === action.toast.id
            ? { ...toast, ...action.toast }
            : toast
        ),
      };

    case actionTypes.DISMISS_TOAST:
      return {
        ...state,
        toasts: state.toasts.map((toast) =>
          action.toastId === undefined || toast.id === action.toastId
            ? {
                ...toast,
                open: false,
              }
            : toast
        ),
      };

    case actionTypes.REMOVE_TOAST:
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }

      return {
        ...state,
        toasts: state.toasts.filter(
          (toast) => toast.id !== action.toastId
        ),
      };

    default:
      return state;
  }
};

const listeners = new Set();

let memoryState = {
  toasts: [],
};

function dispatch(action) {
  memoryState = reducer(memoryState, action);

  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

function dismissToast(toastId) {
  if (toastId) {
    addToRemoveQueue(toastId);
  } else {
    memoryState.toasts.forEach((toast) => {
      addToRemoveQueue(toast.id);
    });
  }

  dispatch({
    type: actionTypes.DISMISS_TOAST,
    toastId,
  });
}

function removeToast(toastId) {
  if (toastId) {
    clearFromRemoveQueue(toastId);
  } else {
    memoryState.toasts.forEach((toast) => {
      clearFromRemoveQueue(toast.id);
    });
  }

  dispatch({
    type: actionTypes.REMOVE_TOAST,
    toastId,
  });
}

function toast(props) {
  const id = genId();

  const update = (updatedProps) => {
    dispatch({
      type: actionTypes.UPDATE_TOAST,
      toast: {
        ...updatedProps,
        id,
      },
    });
  };

  const dismiss = () => dismissToast(id);

  dispatch({
    type: actionTypes.ADD_TOAST,
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) {
          dismiss();
        }
      },
    },
  });

  return {
    id,
    update,
    dismiss,
  };
}

function useToast() {
  const [state, setState] = useState(memoryState);

  useEffect(() => {
    listeners.add(setState);

    return () => {
      listeners.delete(setState);
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: dismissToast,
    remove: removeToast,
  };
}

export { useToast, toast, dismissToast, removeToast };