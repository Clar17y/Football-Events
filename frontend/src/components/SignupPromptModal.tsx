import React from 'react';
import {
  IonModal,
  IonButton,
  IonIcon,
  IonText
} from '@ionic/react';
import { close, logIn, personAdd } from 'ionicons/icons';
import './PromptModal.css';

interface SignupPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SignupPromptModal: React.FC<SignupPromptModalProps> = ({ isOpen, onClose }) => {
  const go = (path: string) => {
    try {
      const p = path.startsWith('/') ? path : `/${path}`;
      window.history.pushState({}, '', p);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch {}
    onClose();
  };

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onClose}
      className="prompt-modal"
    >
      <div className="prompt-container">
        <div className="prompt-header">
          <h2 className="prompt-title">Create a Free Account</h2>
          <IonButton
            fill="clear"
            onClick={onClose}
            className="prompt-close"
          >
            <IonIcon icon={close} />
          </IonButton>
        </div>

        <div className="prompt-content">
          <IonText color="medium">
            <p className="prompt-message">
              Sign up to remove guest limits, sync your data across devices, and access advanced features like Awards and Statistics.
            </p>
          </IonText>

          <div className="prompt-buttons">
            <IonButton
              expand="block"
              onClick={() => go('register')}
            >
              <IonIcon icon={personAdd} slot="start" />
              Create Account
            </IonButton>
            <IonButton
              expand="block"
              fill="outline"
              onClick={() => go('login')}
            >
              <IonIcon icon={logIn} slot="start" />
              Sign In
            </IonButton>
          </div>
        </div>
      </div>
    </IonModal>
  );
};

export default SignupPromptModal;
