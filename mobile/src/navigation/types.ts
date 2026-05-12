export type RootStackParamList = {
  Main: undefined;
  Login: undefined;
  Register: undefined;
};

export type JobsStackParamList = {
  JobsList: undefined;
  JobDetail: { job: any };
};

export type AddLogParams = {
  logId?: string;
  prefill?: any;
  mode?: 'edit' | 'clone' | 'reverse';
};

export type LogbookStackParamList = {
  LogbookList: undefined;
  AddLog: AddLogParams | undefined;
};
