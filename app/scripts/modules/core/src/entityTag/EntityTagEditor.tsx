import * as React from 'react';
import { IDeferred } from 'angular';
import { $q } from 'ngimport';
import { Field, FieldProps, Form, Formik, FormikErrors, FormikProps } from 'formik';
import { Modal } from 'react-bootstrap';
import { IModalServiceInstance } from 'angular-ui-bootstrap';
import { BindAll } from 'lodash-decorators';

import {
  UUIDGenerator, Application, EntityTagWriter, HelpField, IEntityRef, IEntityTag,
  ReactInjector, TaskMonitor, TaskMonitorBuilder, SubmitButton, Markdown
} from 'core';

import { ReactModal } from 'core/presentation';
import { NgReact } from 'core/reactShims/ngReact';
import { EntityRefBuilder } from './entityRef.builder';
import { noop } from 'core/utils';

import './EntityTagEditor.less';

export interface IOwner {
  name: string;
  cloudProvider: string;
  region: string;
  account: string;
}

export interface IOwnerOption {
  label: string;
  type: string;
  owner: IOwner;
  isDefault: boolean;
}

export interface IEntityTagEditorProps {
  owner: IOwner;
  application: Application;
  entityType: string;
  tag: IEntityTag;
  ownerOptions: IOwnerOption[];
  entityRef: IEntityRef;
  isNew: boolean;
  show?: boolean;
  closeModal?(result?: any): void; // provided by ReactModal
  dismissModal?(rejection?: any): void; // provided by ReactModal
  onUpdate?(): void;
}

export interface IEntityTagEditorState {
  taskMonitor: TaskMonitor;
  isSubmitting: boolean;
  initialValues: IEntityTagEditorValues;
}

export interface IEntityTagEditorValues {
  message: string;
  ownerIndex: number | string;
}

@BindAll()
export class EntityTagEditor extends React.Component<IEntityTagEditorProps, IEntityTagEditorState> {
  public static defaultProps: Partial<IEntityTagEditorProps> = {
    onUpdate: noop,
  };

  private taskMonitorBuilder: TaskMonitorBuilder = ReactInjector.taskMonitorBuilder;
  private entityTagWriter: EntityTagWriter = ReactInjector.entityTagWriter;
  private $uibModalInstanceEmulation: IModalServiceInstance & { deferred?: IDeferred<any> };

  /** Shows the Entity Tag Editor modal */
  public static show(props: IEntityTagEditorProps): Promise<void> {
    return ReactModal.show(EntityTagEditor, props);
  }

  constructor(props: IEntityTagEditorProps) {
    super(props);

    const { tag } = this.props;
    const ownerIndex = this.props.ownerOptions ? 0 : -1; // Assuming that the first option is the provided option
    tag.name = tag.name || `spinnaker_ui_${tag.value.type}:${UUIDGenerator.generateUuid()}`;

    this.state = {
      taskMonitor: null,
      initialValues: {
        message: tag.value && tag.value.message || '',
        ownerIndex,
      },
      isSubmitting: false,
    };

    const deferred = $q.defer();
    const promise = deferred.promise;
    this.$uibModalInstanceEmulation = {
      result: promise,
      close: (result: any) => this.props.closeModal(result),
      dismiss: (error: any) => this.props.dismissModal(error),
    } as IModalServiceInstance;
    Object.assign(this.$uibModalInstanceEmulation, { deferred });
  }

  private validate(values: IEntityTagEditorValues): Partial<FormikErrors<IEntityTagEditorValues>> {
    const errors: Partial<FormikErrors<IEntityTagEditorValues>> = {};
    if (!values.message) { errors.message = 'Please enter a message'; }
    return errors;
  }

  private close(): void {
    this.props.dismissModal.apply(null, arguments);
    this.$uibModalInstanceEmulation.deferred.resolve();
  }

  private upsertTag(values: IEntityTagEditorValues): void {
    const { application, isNew, tag, onUpdate, ownerOptions } = this.props;
    const ownerIndex = Number(values.ownerIndex);

    const ownerOption = ownerIndex !== -1 && (ownerOptions || [])[ownerIndex];
    const owner = ownerOption ? ownerOption.owner : this.props.owner;
    const entityType = ownerOption ? ownerOption.type : this.props.entityType;

    const entityRef: IEntityRef = this.props.entityRef || EntityRefBuilder.getBuilder(entityType)(owner);

    tag.value.message = values.message;

    const taskMonitor = this.taskMonitorBuilder.buildTaskMonitor({
      application: application,
      title: `${isNew ? 'Create' : 'Update'} ${this.props.tag.value.type} for ${entityRef.entityId}`,
      modalInstance: this.$uibModalInstanceEmulation,
      onTaskComplete: () => application.entityTags.refresh().then(() => onUpdate()),
    });

    const submitMethod = () => {
      const promise = this.entityTagWriter.upsertEntityTag(application, tag, entityRef, isNew);
      const done = () => this.setState({ isSubmitting: false });
      promise.then(done, done);
      return promise;
    };

    taskMonitor.submit(submitMethod);

    this.setState({ taskMonitor, isSubmitting: true });
  }

  public render() {
    const { isNew, tag, ownerOptions } = this.props;
    const { initialValues, isSubmitting } = this.state;

    const closeButton = (
      <div className="modal-close close-button pull-right">
        <a className="btn btn-link" onClick={this.close}>
          <span className="glyphicon glyphicon-remove" />
        </a>
      </div>
    );

    const submitLabel = `${isNew ? ' Create' : ' Update'} ${tag.value.type}`;

    const { TaskMonitorWrapper } = NgReact;

    return (
      <div>
        <TaskMonitorWrapper monitor={this.state.taskMonitor} />

        <Formik
          initialValues={initialValues}
          onSubmit={this.upsertTag}
          validate={this.validate}
          render={(props: FormikProps<IEntityTagEditorValues>) => (
            <Form className="form-horizontal">
              <Modal.Header>
                <h3>{isNew ? 'Create' : 'Update'} {tag.value.type}</h3>
                {closeButton}
              </Modal.Header>
              <Modal.Body className="entity-tag-editor-modal">
                <div className="row">
                  <div className="col-md-10 col-md-offset-1">
                    <div className="form-group">
                      <div className="col-md-3 sm-label-right">Message</div>
                      <div className="col-md-9">
                        <Field
                          name="message"
                          render={({ field }: FieldProps<IEntityTagEditorValues>) => (
                            <textarea className="form-control input-sm" {...field} rows={5} required={true} />
                          )}
                        />
                        <div className="small text-right"> <div>Markdown is okay <HelpField id="markdown.examples"/></div> </div>
                      </div>
                    </div>
                    {props.values.message && (
                      <div className="form-group preview">
                        <div className="col-md-3 sm-label-right">
                          <strong>Preview</strong>
                        </div>
                        <div className="col-md-9">
                          <Markdown message={props.values.message}/>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {ownerOptions && ownerOptions.length && (
                  <div className="row">
                    <div className="col-md-10 col-md-offset-1">
                      <div className="form-group">
                        <div className="col-md-3 sm-label-right">
                          <b>Applies to</b>
                        </div>
                        <div className="col-md-9">
                          { ownerOptions.map((option, index) => (
                            <div key={option.label} className="radio">
                              <label>
                                <Field
                                  name="ownerIndex"
                                  type="radio"
                                  value={index}
                                  checked={index === Number(props.values.ownerIndex)}
                                />
                                <span className="marked">
                                  <Markdown message={option.label}/>
                                </span>
                              </label>
                            </div>
                          )) }
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </Modal.Body>
              <Modal.Footer>
                <button
                  className="btn btn-default"
                  disabled={isSubmitting}
                  onClick={this.close}
                  type="button"
                >
                  Cancel
                </button>
                <SubmitButton
                  isDisabled={!props.isValid || isSubmitting}
                  submitting={isSubmitting}
                  isFormSubmit={true}
                  label={submitLabel}
                />
              </Modal.Footer>
            </Form>
          )}
        />
      </div>
    );
  }
}
